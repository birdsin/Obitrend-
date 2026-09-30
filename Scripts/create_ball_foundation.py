import sys
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


def log(message):
    unreal.log(f"[OBITREND Ball Setup] {message}")


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

    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    asset = asset_tools.create_asset(asset_name, package_path, asset_class, factory)
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
    if existing_expressions:
        for expression in existing_expressions:
            unreal.MaterialEditingLibrary.delete_material_expression(material, expression)

    checker_texture = load_required_asset(PATTERN_TEXTURE_PATH)

    texture_sample = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionTextureSample, -420, -40
    )
    texture_sample.set_editor_property("texture", checker_texture)
    texture_sample.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)

    roughness_value = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -420, 180
    )
    roughness_value.set_editor_property("r", 0.58)

    specular_value = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant, -420, 280
    )
    specular_value.set_editor_property("r", 0.22)

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


def create_or_update_physical_material():
    physical_material = get_or_create_asset(
        BALL_PM_NAME,
        MATERIAL_DIR,
        unreal.PhysicalMaterial,
        unreal.PhysicalMaterialFactoryNew(),
    )

    physical_material.set_editor_property("friction", 0.65)
    physical_material.set_editor_property("restitution", 0.34)
    physical_material.set_editor_property("density", 0.7)
    unreal.EditorAssetLibrary.save_loaded_asset(physical_material)

    return physical_material


def create_or_update_ball_blueprint(ball_material, physical_material):
    blueprint_path = f"{BLUEPRINT_DIR}/{BALL_BP_NAME}"
    if unreal.EditorAssetLibrary.does_asset_exist(blueprint_path):
        blueprint = unreal.load_asset(blueprint_path)
        log(f"Reusing blueprint: {blueprint_path}")
    else:
        blueprint = unreal.BlueprintFactory().factory_create_new(f"{BLUEPRINT_DIR}/{BALL_BP_NAME}")
        if blueprint is None:
            # Fallback when direct factory creation is not supported.
            blueprint = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
                BALL_BP_NAME,
                BLUEPRINT_DIR,
                None,
                unreal.BlueprintFactory(),
            )
        if blueprint is None:
            raise RuntimeError(f"Failed to create blueprint: {blueprint_path}")

        parent_class = unreal.StaticMeshActor
        unreal.BlueprintEditorLibrary.reparent_blueprint(blueprint, parent_class)
        log(f"Created blueprint: {blueprint_path}")

    # Ensure the blueprint is a StaticMeshActor-derived class with its default static mesh component.
    if unreal.BlueprintEditorLibrary.get_blueprint_parent_class(blueprint) != unreal.StaticMeshActor:
        unreal.BlueprintEditorLibrary.reparent_blueprint(blueprint, unreal.StaticMeshActor)

    generated_class = blueprint.generated_class()
    if generated_class is None:
        unreal.KismetEditorUtilities.compile_blueprint(blueprint)
        generated_class = blueprint.generated_class()
    if generated_class is None:
        raise RuntimeError("Blueprint generated class is unavailable after compile.")

    cdo = unreal.get_default_object(generated_class)
    mesh_component = cdo.get_editor_property("static_mesh_component")
    if mesh_component is None:
        raise RuntimeError("Static mesh component is missing from the ball blueprint.")

    sphere_mesh = load_required_asset(SPHERE_MESH_PATH)
    mesh_component.set_static_mesh(sphere_mesh)
    mesh_component.set_material(0, ball_material)
    mesh_component.set_collision_profile_name("PhysicsActor")
    mesh_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    mesh_component.set_editor_property("relative_scale3d", unreal.Vector(0.22, 0.22, 0.22))
    mesh_component.set_editor_property("phys_material_override", physical_material)
    mesh_component.set_editor_property("can_character_step_up_on", unreal.CanBeCharacterBase.ECB_NO)
    mesh_component.set_editor_property("linear_damping", 0.08)
    mesh_component.set_editor_property("angular_damping", 0.14)
    mesh_component.set_editor_property("simulate_physics", True)
    mesh_component.set_editor_property("enable_gravity", True)
    mesh_component.set_editor_property("generate_overlap_events", True)

    try:
        mesh_component.set_mass_override_in_kg(unreal.Name("None"), 0.43, True)
    except Exception:
        log("Mass override API is unavailable; using mesh/component defaults.")

    cdo.set_actor_enable_collision(True)
    cdo.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)

    unreal.KismetEditorUtilities.compile_blueprint(blueprint)
    unreal.EditorAssetLibrary.save_loaded_asset(blueprint)

    return blueprint


def get_spawn_location():
    actors = unreal.EditorLevelLibrary.get_all_level_actors()
    for actor in actors:
        if actor.get_class().get_name() == "PlayerStart":
            return actor.get_actor_location() + unreal.Vector(180.0, 0.0, 90.0)
    return unreal.Vector(250.0, 0.0, 120.0)


def place_ball_in_level(blueprint):
    world = unreal.EditorLevelLibrary.get_editor_world()
    if world is None:
        raise RuntimeError("Editor world is unavailable.")

    generated_class = blueprint.generated_class()
    if generated_class is None:
        raise RuntimeError("Cannot place ball; generated class is unavailable.")

    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        if actor.get_actor_label() == BALL_LABEL:
            log("Ball actor already exists in level; leaving it in place.")
            return actor

    spawn_location = get_spawn_location()
    spawn_rotation = unreal.Rotator(0.0, 0.0, 0.0)
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(generated_class, spawn_location, spawn_rotation)
    if actor is None:
        raise RuntimeError("Failed to spawn ball actor into the level.")

    actor.set_actor_label(BALL_LABEL, mark_dirty=True)
    log(f"Placed ball actor at {spawn_location}.")
    return actor


def main():
    ensure_directory(PROJECT_BALL_DIR)
    ensure_directory(BLUEPRINT_DIR)
    ensure_directory(MATERIAL_DIR)

    if unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH) is None:
        raise RuntimeError(f"Failed to load map: {MAP_PATH}")

    ball_material = create_or_update_material()
    physical_material = create_or_update_physical_material()
    blueprint = create_or_update_ball_blueprint(ball_material, physical_material)
    place_ball_in_level(blueprint)

    unreal.EditorAssetLibrary.save_directory(PROJECT_BALL_DIR, only_if_is_dirty=False, recursive=True)
    unreal.EditorLevelLibrary.save_current_level()
    unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
    log("Ball foundation setup completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Setup failed: {exc}")
        traceback.print_exc()
        sys.exit(1)
