import json
import traceback
import unreal


PROJECT_BALL_DIR = "/Game/Ball"
BLUEPRINT_DIR = f"{PROJECT_BALL_DIR}/Blueprints"
MATERIAL_DIR = f"{PROJECT_BALL_DIR}/Materials"
MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"

BALL_BP_NAME = "BP_Football"
BALL_MAT_NAME = "M_Football"
BALL_PM_NAME = "PM_Football"
BALL_LABEL = "OBITREND_Football_01"

SPHERE_MESH_PATH = "/Engine/BasicShapes/Sphere.Sphere"
PATTERN_TEXTURE_PATH = "/Game/LevelPrototyping/Textures/T_GridChecker_A.T_GridChecker_A"
PLAYER_BP_CAST_NODE = "Utilities|Casting|CastToBP_ThirdPersonCharacter"

KICK_IMPULSE = 350.0
BALL_SCALE = unreal.Vector(0.22, 0.22, 0.22)


def log(message):
    unreal.log(f"[OBITREND Ball System] {message}")


def ensure_directory(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        unreal.EditorAssetLibrary.make_directory(path)
        log(f"Created directory: {path}")


def load_required_asset(path):
    asset = unreal.load_asset(path)
    if asset is None:
        raise RuntimeError(f"Required asset not found: {path}")
    return asset


def get_or_create_asset(asset_name, package_path, asset_class, factory):
    asset_path = f"{package_path}/{asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        asset = unreal.load_asset(asset_path)
        log(f"Reusing asset: {asset_path}")
        return asset

    asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        asset_name,
        package_path,
        asset_class,
        factory,
    )
    if asset is None:
        raise RuntimeError(f"Failed to create asset: {asset_path}")

    log(f"Created asset: {asset_path}")
    return asset


def create_or_update_material():
    material = get_or_create_asset(
        BALL_MAT_NAME,
        MATERIAL_DIR,
        unreal.Material,
        unreal.MaterialFactoryNew(),
    )

    existing_expressions = unreal.MaterialEditingLibrary.get_material_expressions(material)
    for expression in existing_expressions:
        unreal.MaterialEditingLibrary.delete_material_expression(material, expression)

    checker_texture = load_required_asset(PATTERN_TEXTURE_PATH)

    texture_sample = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -420, -40
    )
    texture_sample.set_editor_property("texture", checker_texture)
    texture_sample.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)

    roughness_value = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -420, 180
    )
    roughness_value.set_editor_property("r", 0.48)

    specular_value = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -420, 280
    )
    specular_value.set_editor_property("r", 0.32)

    unreal.MaterialEditingLibrary.connect_material_property(
        texture_sample, "RGB", unreal.MaterialProperty.MP_BASE_COLOR
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        roughness_value, "", unreal.MaterialProperty.MP_ROUGHNESS
    )
    unreal.MaterialEditingLibrary.connect_material_property(
        specular_value, "", unreal.MaterialProperty.MP_SPECULAR
    )

    unreal.MaterialEditingLibrary.layout_material_expressions(material)
    unreal.MaterialEditingLibrary.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


def get_editor_world():
    world = unreal.EditorLevelLibrary.get_editor_world()
    if world is None:
        raise RuntimeError("Editor world is unavailable.")
    return world


def normalize_package_path(package_name):
    package_path = str(package_name)
    if "." in package_path:
        package_path = package_path.split(".", 1)[0]
    return package_path


def ensure_target_level_is_open():
    world = get_editor_world()
    current_map_path = normalize_package_path(world.get_path_name())
    if current_map_path != MAP_PATH:
        raise RuntimeError(
            f"Expected open map '{MAP_PATH}', but current editor world is '{current_map_path}'."
        )
    log(f"Verified open map: {current_map_path}")
    return world


def create_or_update_physical_material():
    physical_material = get_or_create_asset(
        BALL_PM_NAME,
        MATERIAL_DIR,
        unreal.PhysicalMaterial,
        unreal.PhysicalMaterialFactoryNew(),
    )

    physical_material.set_editor_property("friction", 0.82)
    physical_material.set_editor_property("restitution", 0.18)
    physical_material.set_editor_property("density", 0.7)
    unreal.EditorAssetLibrary.save_loaded_asset(physical_material)
    return physical_material


def get_blueprint_generated_class(blueprint):
    generated = blueprint.generated_class() if hasattr(blueprint, "generated_class") else None
    if generated is None:
        try:
            generated = blueprint.get_editor_property("generated_class")
        except Exception:
            generated = None
    return generated


def create_or_update_ball_blueprint(ball_material, physical_material):
    blueprint_path = f"{BLUEPRINT_DIR}/{BALL_BP_NAME}"
    if unreal.EditorAssetLibrary.does_asset_exist(blueprint_path):
        blueprint = unreal.load_asset(blueprint_path)
        log(f"Reusing blueprint: {blueprint_path}")
    else:
        blueprint = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            BALL_BP_NAME,
            BLUEPRINT_DIR,
            None,
            unreal.BlueprintFactory(),
        )
        if blueprint is None:
            raise RuntimeError(f"Failed to create blueprint: {blueprint_path}")
        log(f"Created blueprint: {blueprint_path}")

    if unreal.BlueprintEditorLibrary.get_blueprint_parent_class(blueprint) != unreal.StaticMeshActor:
        unreal.BlueprintEditorLibrary.reparent_blueprint(blueprint, unreal.StaticMeshActor)

    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Initial compile failed for BP_Football")

    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class is None:
        raise RuntimeError("BP_Football generated class is unavailable")

    cdo = unreal.get_default_object(generated_class)
    mesh_component = cdo.get_editor_property("static_mesh_component")
    if mesh_component is None:
        raise RuntimeError("BP_Football static mesh component is missing")

    sphere_mesh = load_required_asset(SPHERE_MESH_PATH)
    mesh_component.set_static_mesh(sphere_mesh)
    mesh_component.set_material(0, ball_material)
    mesh_component.set_collision_profile_name("PhysicsActor")
    mesh_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    mesh_component.set_editor_property("relative_scale3d", BALL_SCALE)
    mesh_component.set_phys_material_override(physical_material)
    mesh_component.set_editor_property("can_character_step_up_on", unreal.CanBeCharacterBase.ECB_NO)
    mesh_component.set_linear_damping(0.20)
    mesh_component.set_angular_damping(0.32)
    mesh_component.set_simulate_physics(True)
    mesh_component.set_enable_gravity(True)
    mesh_component.set_editor_property("generate_overlap_events", True)
    try:
        mesh_component.set_editor_property("notify_rigid_body_collision", True)
    except Exception:
        pass

    try:
        mesh_component.set_mass_override_in_kg(unreal.Name("None"), 0.43, True)
    except Exception:
        log("Mass override API unavailable; using component default mass.")

    cdo.set_actor_enable_collision(True)
    return blueprint


def get_pin(node, *name_fragments):
    def normalize(value):
        return str(value).lower().replace(" ", "").replace("_", "")

    fragments = [normalize(fragment) for fragment in name_fragments]
    for pin in node.list_all_pins():
        pin_name = normalize(pin.get_pin_name())
        for fragment in fragments:
            if pin_name == fragment or fragment in pin_name:
                return pin
    available = [str(pin.get_pin_name()) for pin in node.list_all_pins()]
    raise RuntimeError(f"Could not find pin {name_fragments} on node '{node.get_node_title()}'. Pins: {available}")


def connect(output_pin, input_pin, description):
    if not output_pin.try_create_connection(input_pin):
        raise RuntimeError(f"Failed to connect pins for {description}")


def set_pin(pin, value):
    if not pin.set_pin_value(value):
        raise RuntimeError(f"Failed to set pin '{pin.get_pin_name()}' to '{value}'")


def rebuild_ball_kick_graph(blueprint):
    event_graph = unreal.BlueprintEditorLibrary.find_event_graph(blueprint)
    if event_graph is None:
        raise RuntimeError("BP_Football event graph is missing")

    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    existing_nodes = event_editor.list_all_nodes()
    if existing_nodes:
        event_editor.remove_nodes(existing_nodes)

    receive_hit = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveHit",
        unreal.IntPoint(-1200, -100),
    )
    if receive_hit is None:
        raise RuntimeError("Failed to add ReceiveHit override to BP_Football")

    receive_hit.set_node_pos(unreal.IntPoint(-1200, -100))

    cast_node = event_editor.create_node_from_name(
        PLAYER_BP_CAST_NODE,
        unreal.Vector2D(-920.0, -100.0),
        [],
    )
    forward_node = event_editor.create_node_from_name(
        "Transformation|GetActorForwardVector",
        unreal.Vector2D(-620.0, -160.0),
        [],
    )
    multiply_node = event_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(-320.0, -150.0),
        [get_pin(forward_node, "return", "result")],
    )
    get_mesh_node = event_editor.create_node_from_name(
        "Variables|StaticMeshActor|GetStaticMeshComponent",
        unreal.Vector2D(-620.0, 120.0),
        [],
    )
    add_impulse_node = event_editor.create_node_from_name(
        "Physics|AddImpulse",
        unreal.Vector2D(-20.0, -40.0),
        [get_pin(get_mesh_node, "staticmeshcomponent", "static_mesh_component")],
    )

    if None in (cast_node, forward_node, multiply_node, get_mesh_node, add_impulse_node):
        raise RuntimeError("Failed to create one or more BP_Football graph nodes")

    receive_hit_then = get_pin(receive_hit, "then")
    receive_hit_other = get_pin(receive_hit, "other")
    cast_exec = get_pin(cast_node, "execute", "exec")
    cast_input = get_pin(cast_node, "object")
    cast_success = get_pin(cast_node, "then")
    cast_as_player = get_pin(cast_node, "as bp_thirdpersoncharacter")
    forward_target = get_pin(forward_node, "target", "self")
    forward_result = get_pin(forward_node, "return", "result")
    multiply_a = get_pin(multiply_node, "a")
    multiply_b = get_pin(multiply_node, "b")
    multiply_result = get_pin(multiply_node, "return", "result")
    mesh_result = get_pin(get_mesh_node, "staticmeshcomponent", "static_mesh_component")
    impulse_exec = get_pin(add_impulse_node, "execute", "exec")
    impulse_value = get_pin(add_impulse_node, "impulse")

    connect(receive_hit_then, cast_exec, "ReceiveHit -> Cast execute")
    connect(receive_hit_other, cast_input, "ReceiveHit other actor -> Cast object")
    connect(cast_success, impulse_exec, "Cast success -> AddImpulse execute")
    connect(cast_as_player, forward_target, "Cast result -> GetActorForwardVector target")
    connect(forward_result, multiply_a, "Forward vector -> Multiply A")
    connect(multiply_result, impulse_value, "Kick impulse vector -> AddImpulse")
    set_pin(multiply_b, str(KICK_IMPULSE))

    log("Rebuilt BP_Football kick graph.")


def find_player_start():
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_actor_label() == "PlayerStart":
            return actor
    raise RuntimeError("PlayerStart not found in Lvl_ThirdPerson")


def get_ball_spawn_location():
    player_start = find_player_start()
    location = player_start.get_actor_location()
    forward = player_start.get_actor_forward_vector()
    return location + (forward * 260.0) + unreal.Vector(0.0, 0.0, -80.0)


def place_exactly_one_ball(blueprint):
    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class is None:
        raise RuntimeError("Cannot place football; generated class is unavailable")

    existing = []
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_actor_label() == BALL_LABEL or actor.get_class().get_name() == f"{BALL_BP_NAME}_C":
            existing.append(actor)

    keep_actor = existing[0] if existing else None
    for actor in existing[1:]:
        unreal.EditorLevelLibrary.destroy_actor(actor)

    spawn_location = get_ball_spawn_location()
    if keep_actor is None:
        keep_actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
            generated_class,
            spawn_location,
            unreal.Rotator(0.0, 0.0, 0.0),
        )
        if keep_actor is None:
            raise RuntimeError("Failed to spawn football actor")

    keep_actor.set_actor_label(BALL_LABEL, mark_dirty=True)
    keep_actor.set_actor_location(spawn_location, False, False)
    keep_actor.set_actor_rotation(unreal.Rotator(0.0, 0.0, 0.0), False)
    log(f"Placed football at {spawn_location}.")
    return keep_actor


def save_assets_and_level():
    if not unreal.EditorAssetLibrary.save_directory(PROJECT_BALL_DIR, only_if_is_dirty=False, recursive=True):
        raise RuntimeError("Failed to save /Game/Ball assets")

    world = ensure_target_level_is_open()

    if not unreal.EditorLoadingAndSavingUtils.save_map(world, MAP_PATH):
        raise RuntimeError(f"Failed to save map: {MAP_PATH}")

    log("Saved football assets and level.")


def verify_ball_state(ball_actor, blueprint):
    mesh_component = ball_actor.get_component_by_class(unreal.StaticMeshComponent)
    if mesh_component is None:
        raise RuntimeError("Placed football actor is missing a StaticMeshComponent")

    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    node_titles = [node.get_node_title() for node in event_editor.list_all_nodes()]
    world = ensure_target_level_is_open()

    verification = {
        "open_map": normalize_package_path(world.get_path_name()),
        "ball_actor_label": ball_actor.get_actor_label(),
        "ball_actor_location": [
            round(ball_actor.get_actor_location().x, 2),
            round(ball_actor.get_actor_location().y, 2),
            round(ball_actor.get_actor_location().z, 2),
        ],
        "ball_blueprint": f"{BLUEPRINT_DIR}/{BALL_BP_NAME}",
        "simulate_physics": bool(mesh_component.is_simulating_physics()),
        "collision_profile": str(mesh_component.get_collision_profile_name()),
        "enable_gravity": bool(mesh_component.is_gravity_enabled()),
        "linear_damping": round(mesh_component.get_linear_damping(), 3),
        "angular_damping": round(mesh_component.get_angular_damping(), 3),
        "kick_graph_has_receive_hit": any("Hit" in title for title in node_titles),
        "kick_graph_has_add_impulse": any(title == "AddImpulse" for title in node_titles),
    }
    log(json.dumps(verification))
    return verification


def main():
    ensure_directory(PROJECT_BALL_DIR)
    ensure_directory(BLUEPRINT_DIR)
    ensure_directory(MATERIAL_DIR)
    ensure_target_level_is_open()

    ball_material = create_or_update_material()
    physical_material = create_or_update_physical_material()
    blueprint = create_or_update_ball_blueprint(ball_material, physical_material)
    rebuild_ball_kick_graph(blueprint)

    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("BP_Football failed to compile after graph changes")

    unreal.EditorAssetLibrary.save_loaded_asset(blueprint)
    ball_actor = place_exactly_one_ball(blueprint)
    save_assets_and_level()
    verify_ball_state(ball_actor, blueprint)
    log("Football ball system implementation completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Implementation failed: {exc}")
        traceback.print_exc()
        raise
