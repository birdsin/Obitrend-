import json
import time
import traceback
import unreal


CHARACTER_BP_PATH = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
BALL_BP_PATH = "/Game/Ball/Blueprints/BP_Football"
IA_JUMP_PATH = "/Game/Input/Actions/IA_Jump"
IA_KICK_PATH = "/Game/Input/Actions/IA_Kick"
IMC_DEFAULT_PATH = "/Game/Input/IMC_Default"
BALL_LABEL = "OBITREND_Football_01"
MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"

FUNCTION_NAME = "KickFootball"
SUSPEND_CONTROL_FUNCTION_NAME = "SuspendBallControl"
KICK_DISTANCE = 220.0
KICK_IMPULSE = 1200.0
KICK_INPUT_EVENT_NODE = "Input|EnhancedActionEvents|IA_Kick"


def log(message):
    unreal.log(f"[OBITREND Player Kick] {message}")


def load_required_asset(path):
    asset = unreal.load_asset(path)
    if asset is None:
        raise RuntimeError(f"Required asset not found: {path}")
    return asset


def get_editor_world():
    try:
        subsystem = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
        world = subsystem.get_editor_world()
        if world is not None:
            return world
    except Exception:
        pass

    return unreal.EditorLevelLibrary.get_editor_world()


def normalize_package_path(package_name):
    package_path = str(package_name)
    if "." in package_path:
        package_path = package_path.split(".", 1)[0]
    return package_path


def ensure_target_level_is_open():
    world = get_editor_world()
    if world is None:
        log("Editor world handle is unavailable in remote context; continuing with asset-level changes.")
        return None
    current_map_path = normalize_package_path(world.get_path_name())
    if current_map_path != MAP_PATH:
        raise RuntimeError(
            f"Expected open map '{MAP_PATH}', but current editor world is '{current_map_path}'."
        )
    log(f"Verified open map: {current_map_path}")
    return world


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


def get_or_create_function_editor(blueprint, func_name):
    editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, func_name)
    if editor is not None:
        return editor
    return unreal.BlueprintGraphEditor.create_and_edit_function_graph(blueprint, func_name)


def ensure_kick_input_assets():
    if not unreal.EditorAssetLibrary.does_asset_exist(IA_KICK_PATH):
        if not unreal.EditorAssetLibrary.duplicate_asset(IA_JUMP_PATH, IA_KICK_PATH):
            raise RuntimeError(f"Failed to create kick input action from {IA_JUMP_PATH}")
        log(f"Created kick input action: {IA_KICK_PATH}")

    kick_action = load_required_asset(IA_KICK_PATH)
    input_mapping_context = load_required_asset(IMC_DEFAULT_PATH)

    kick_key = unreal.Key()
    kick_key.set_editor_property("key_name", unreal.Name("F"))

    input_mapping_context.unmap_all_keys_from_action(kick_action)
    input_mapping_context.map_key(kick_action, kick_key)

    packages = [kick_action.get_outermost(), input_mapping_context.get_outermost()]
    if not unreal.EditorLoadingAndSavingUtils.save_packages(packages, True):
        raise RuntimeError("Failed to save kick input assets")

    return kick_action, input_mapping_context


def rebuild_kick_function_graph(blueprint, ball_class):
    function_editor = get_or_create_function_editor(blueprint, FUNCTION_NAME)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {FUNCTION_NAME}")
    function_editor.set_function_is_public()

    nodes = function_editor.list_all_nodes()
    entry_node = None
    removable_nodes = []
    for node in nodes:
        if node.get_node_title() == FUNCTION_NAME:
            entry_node = node
        else:
            removable_nodes.append(node)

    if entry_node is None:
        raise RuntimeError(f"Function entry node not found for {FUNCTION_NAME}")

    if removable_nodes:
        function_editor.remove_nodes(removable_nodes)

    get_all_actors_node = function_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-860.0, -80.0),
        [],
    )
    is_valid_index_node = function_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-620.0, -120.0),
        [get_pin(get_all_actors_node, "outactors")],
    )
    branch_has_ball = function_editor.add_branch_node()
    branch_has_ball.set_node_pos(unreal.IntPoint(-400, -40))

    get_ball_node = function_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-620.0, 110.0),
        [],
    )
    distance_node = function_editor.create_node_from_name(
        "Transformation|GetDistanceTo",
        unreal.Vector2D(-360.0, 120.0),
        [],
    )
    distance_check_node = function_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-110.0, 120.0),
        [get_pin(distance_node, "return", "distance")],
    )
    branch_is_close = function_editor.add_branch_node()
    branch_is_close.set_node_pos(unreal.IntPoint(120, 40))
    cast_ball_bp_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToBP_Football",
        unreal.Vector2D(360.0, 290.0),
        [],
    )
    suspend_control_node = function_editor.create_node_from_name(
        f"CallFunction|{SUSPEND_CONTROL_FUNCTION_NAME}",
        unreal.Vector2D(640.0, 290.0),
        [get_pin(cast_ball_bp_node, "asbpfootball", "asbp")],
    )

    get_ball_component_node = function_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(380.0, 110.0),
        [],
    )
    cast_mesh_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToStaticMeshComponent",
        unreal.Vector2D(640.0, 110.0),
        [],
    )
    get_forward_node = function_editor.create_node_from_name(
        "Transformation|GetActorForwardVector",
        unreal.Vector2D(380.0, -80.0),
        [],
    )
    break_vector_node = function_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(610.0, -180.0),
        [],
    )
    multiply_x_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(860.0, -220.0),
        [],
    )
    multiply_y_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(860.0, -80.0),
        [],
    )
    multiply_z_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(860.0, 60.0),
        [],
    )
    make_vector_node = function_editor.create_node_from_name(
        "Math|Vector|MakeVector",
        unreal.Vector2D(1120.0, -80.0),
        [],
    )
    add_impulse_node = function_editor.create_node_from_name(
        "Physics|AddImpulse",
        unreal.Vector2D(1380.0, 0.0),
        [],
    )

    if None in (
        get_all_actors_node,
        is_valid_index_node,
        branch_has_ball,
        get_ball_node,
        distance_node,
        distance_check_node,
        branch_is_close,
        cast_ball_bp_node,
        suspend_control_node,
        get_ball_component_node,
        cast_mesh_node,
        get_forward_node,
        break_vector_node,
        multiply_x_node,
        multiply_y_node,
        multiply_z_node,
        make_vector_node,
        add_impulse_node,
    ):
        raise RuntimeError("Failed to create one or more KickFootball nodes")

    entry_then = get_pin(entry_node, "then")
    get_all_exec = get_pin(get_all_actors_node, "execute", "exec")
    get_all_class = get_pin(get_all_actors_node, "actorclass")
    get_all_out = get_pin(get_all_actors_node, "outactors")
    get_all_then = get_pin(get_all_actors_node, "then")

    is_valid_target_array = get_pin(is_valid_index_node, "targetarray")
    is_valid_index = get_pin(is_valid_index_node, "index")
    is_valid_result = get_pin(is_valid_index_node, "return", "result")

    branch_has_ball_exec = get_pin(branch_has_ball, "execute", "exec")
    branch_has_ball_condition = get_pin(branch_has_ball, "condition")
    branch_has_ball_true = get_pin(branch_has_ball, "then")

    get_ball_index = get_pin(get_ball_node, "dimension1", "index")
    get_ball_array = get_pin(get_ball_node, "array", "targetarray")
    get_ball_item = get_pin(get_ball_node, "output", "item", "return")

    distance_other = get_pin(distance_node, "otheractor")
    distance_value = get_pin(distance_node, "return", "distance")

    distance_check_a = get_pin(distance_check_node, "a")
    distance_check_b = get_pin(distance_check_node, "b")
    distance_check_result = get_pin(distance_check_node, "return", "result")

    branch_is_close_exec = get_pin(branch_is_close, "execute", "exec")
    branch_is_close_condition = get_pin(branch_is_close, "condition")
    branch_is_close_true = get_pin(branch_is_close, "then")
    cast_ball_bp_exec = get_pin(cast_ball_bp_node, "execute", "exec")
    cast_ball_bp_object = get_pin(cast_ball_bp_node, "object")
    cast_ball_bp_then = get_pin(cast_ball_bp_node, "then")
    suspend_control_exec = get_pin(suspend_control_node, "execute", "exec")
    suspend_control_then = get_pin(suspend_control_node, "then")

    get_component_self = get_pin(get_ball_component_node, "self")
    get_component_class = get_pin(get_ball_component_node, "componentclass")
    get_component_return = get_pin(get_ball_component_node, "return", "returnvalue")
    cast_mesh_exec = get_pin(cast_mesh_node, "execute", "exec")
    cast_mesh_object = get_pin(cast_mesh_node, "object")
    cast_mesh_then = get_pin(cast_mesh_node, "then")
    cast_mesh_result = get_pin(cast_mesh_node, "asstaticmeshcomponent")
    forward_result = get_pin(get_forward_node, "return", "result")
    break_vector_input = get_pin(break_vector_node, "invec")
    break_vector_x = get_pin(break_vector_node, "x")
    break_vector_y = get_pin(break_vector_node, "y")
    break_vector_z = get_pin(break_vector_node, "z")
    multiply_x_a = get_pin(multiply_x_node, "a")
    multiply_x_b = get_pin(multiply_x_node, "b")
    multiply_x_result = get_pin(multiply_x_node, "return", "result")
    multiply_y_a = get_pin(multiply_y_node, "a")
    multiply_y_b = get_pin(multiply_y_node, "b")
    multiply_y_result = get_pin(multiply_y_node, "return", "result")
    multiply_z_a = get_pin(multiply_z_node, "a")
    multiply_z_b = get_pin(multiply_z_node, "b")
    multiply_z_result = get_pin(multiply_z_node, "return", "result")
    make_vector_x = get_pin(make_vector_node, "x")
    make_vector_y = get_pin(make_vector_node, "y")
    make_vector_z = get_pin(make_vector_node, "z")
    make_vector_result = get_pin(make_vector_node, "return", "result")
    add_impulse_exec = get_pin(add_impulse_node, "execute", "exec")
    add_impulse_self = get_pin(add_impulse_node, "self")
    add_impulse_value = get_pin(add_impulse_node, "impulse")

    connect(entry_then, get_all_exec, "KickFootball -> GetAllActorsOfClass")
    connect(get_all_then, branch_has_ball_exec, "GetAllActorsOfClass -> HasBall branch")
    connect(get_all_out, is_valid_target_array, "OutActors -> IsValidIndex array")
    connect(is_valid_result, branch_has_ball_condition, "HasBall condition")

    connect(get_all_out, get_ball_array, "OutActors -> Get ball array")
    connect(branch_has_ball_true, branch_is_close_exec, "HasBall true -> CloseEnough branch")
    connect(get_ball_item, distance_other, "Ball actor -> GetDistanceTo other actor")
    connect(distance_value, distance_check_a, "Distance -> Less A")
    connect(distance_check_result, branch_is_close_condition, "CloseEnough condition")

    connect(branch_is_close_true, cast_ball_bp_exec, "CloseEnough true -> CastToBP_Football")
    connect(get_ball_item, cast_ball_bp_object, "Ball actor -> CastToBP_Football object")
    connect(cast_ball_bp_then, suspend_control_exec, "CastToBP_Football -> SuspendBallControl")
    connect(suspend_control_then, cast_mesh_exec, "SuspendBallControl -> CastToStaticMeshComponent")
    connect(get_ball_item, get_component_self, "Ball actor -> GetComponentByClass self")
    connect(get_component_return, cast_mesh_object, "GetComponentByClass -> CastToStaticMeshComponent")
    connect(forward_result, break_vector_input, "Forward vector -> BreakVector")
    connect(break_vector_x, multiply_x_a, "Forward X -> Multiply X")
    connect(break_vector_y, multiply_y_a, "Forward Y -> Multiply Y")
    connect(break_vector_z, multiply_z_a, "Forward Z -> Multiply Z")
    connect(multiply_x_result, make_vector_x, "Impulse X -> MakeVector X")
    connect(multiply_y_result, make_vector_y, "Impulse Y -> MakeVector Y")
    connect(multiply_z_result, make_vector_z, "Impulse Z -> MakeVector Z")
    connect(cast_mesh_then, add_impulse_exec, "Cast success -> AddImpulse")
    connect(cast_mesh_result, add_impulse_self, "StaticMeshComponent -> AddImpulse self")
    connect(make_vector_result, add_impulse_value, "Impulse vector -> AddImpulse")

    set_pin(get_all_class, ball_class.get_path_name())
    set_pin(is_valid_index, "0")
    set_pin(get_ball_index, "0")
    set_pin(get_component_class, unreal.StaticMeshComponent.static_class().get_path_name())
    set_pin(distance_check_b, str(KICK_DISTANCE))
    set_pin(multiply_x_b, str(KICK_IMPULSE))
    set_pin(multiply_y_b, str(KICK_IMPULSE))
    set_pin(multiply_z_b, str(KICK_IMPULSE))

    log("Rebuilt KickFootball function graph.")


def rebuild_event_graph(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    if event_editor is None:
        raise RuntimeError("BP_ThirdPersonCharacter EventGraph is missing")

    removable_nodes = []
    for node in event_editor.list_all_nodes():
        title = node.get_node_title()
        if title in {"F", FUNCTION_NAME, "EnhancedInputAction IA_Kick"}:
            removable_nodes.append(node)

    if removable_nodes:
        event_editor.remove_nodes(removable_nodes)

    key_event_node = event_editor.create_node_from_name(
        KICK_INPUT_EVENT_NODE,
        unreal.Vector2D(920.0, 120.0),
        [],
    )
    if key_event_node is None:
        raise RuntimeError("Failed to create IA_Kick input event node")

    call_kick_node = event_editor.create_node_from_name(
        f"CallFunction|{FUNCTION_NAME}",
        unreal.Vector2D(1160.0, 120.0),
        [],
    )
    if call_kick_node is None:
        raise RuntimeError("Failed to create KickFootball call node in EventGraph")

    connect(
        get_pin(key_event_node, "started"),
        get_pin(call_kick_node, "execute", "exec"),
        "IA_Kick Started -> KickFootball",
    )

    log("Rebuilt EventGraph kick input nodes.")


def save_blueprint(blueprint):
    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("BP_ThirdPersonCharacter failed to compile after kick changes")

    package = blueprint.get_outermost()
    if package is None:
        raise RuntimeError("BP_ThirdPersonCharacter package is unavailable for save")

    if not unreal.EditorLoadingAndSavingUtils.save_packages([package], True):
        raise RuntimeError("Failed to save BP_ThirdPersonCharacter")


def verify_editor_asset_state(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    function_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, FUNCTION_NAME)

    event_titles = [node.get_node_title() for node in event_editor.list_all_nodes()]
    function_titles = [node.get_node_title() for node in function_editor.list_all_nodes()]

    verification = {
        "event_graph_has_ia_kick": "EnhancedInputAction IA_Kick" in event_titles,
        "event_graph_has_kick_call": FUNCTION_NAME in event_titles,
        "function_graph_nodes": function_titles,
        "kick_distance": KICK_DISTANCE,
        "kick_impulse": KICK_IMPULSE,
    }
    log(json.dumps(verification))
    return verification


def run_pie_verification():
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if level_subsystem.is_in_play_in_editor():
        level_subsystem.editor_request_end_play()
        time.sleep(0.5)

    level_subsystem.editor_request_begin_play()

    pie_world = None
    pawn = None
    controller = None
    for _ in range(80):
        if level_subsystem.is_in_play_in_editor():
            pie_worlds = unreal.EditorLevelLibrary.get_pie_worlds(False)
            if pie_worlds:
                pie_world = pie_worlds[0]
                pawn = unreal.GameplayStatics.get_player_pawn(pie_world, 0)
                controller = unreal.GameplayStatics.get_player_controller(pie_world, 0)
                if pawn is not None and controller is not None:
                    break
        time.sleep(0.1)

    if pie_world is None:
        raise RuntimeError("Failed to enter PIE for kick verification")
    if pawn is None or controller is None:
        raise RuntimeError("PIE player pawn/controller unavailable")

    ball_actors = [
        actor
        for actor in unreal.GameplayStatics.get_all_actors_of_class(pie_world, unreal.StaticMeshActor)
        if actor.get_actor_label() == BALL_LABEL
    ]
    if len(ball_actors) != 1:
        raise RuntimeError(f"Expected exactly one football in PIE, found {len(ball_actors)}")

    ball_actor = ball_actors[0]
    ball_mesh = ball_actor.get_component_by_class(unreal.StaticMeshComponent)
    if ball_mesh is None:
        raise RuntimeError("Football actor is missing a StaticMeshComponent in PIE")

    ball_location_before = ball_actor.get_actor_location()
    pawn.set_actor_location(unreal.Vector(ball_location_before.x - 160.0, ball_location_before.y, ball_location_before.z + 48.0), False, False)
    pawn.set_actor_rotation(unreal.Rotator(0.0, 0.0, 0.0), False)

    time.sleep(0.1)
    pawn.call_method(FUNCTION_NAME)
    time.sleep(0.25)

    ball_location_after = ball_actor.get_actor_location()
    ball_velocity = ball_mesh.get_physics_linear_velocity()

    verification = {
        "pawn_class": pawn.get_class().get_name(),
        "controller_class": controller.get_class().get_name(),
        "has_movement_component": bool(pawn.get_component_by_class(unreal.CharacterMovementComponent)),
        "ball_count_in_pie": len(ball_actors),
        "ball_location_before": [
            round(ball_location_before.x, 2),
            round(ball_location_before.y, 2),
            round(ball_location_before.z, 2),
        ],
        "ball_location_after": [
            round(ball_location_after.x, 2),
            round(ball_location_after.y, 2),
            round(ball_location_after.z, 2),
        ],
        "ball_velocity_after": [
            round(ball_velocity.x, 2),
            round(ball_velocity.y, 2),
            round(ball_velocity.z, 2),
        ],
        "kick_moved_ball_forward": ball_location_after.x > ball_location_before.x + 1.0,
    }

    level_subsystem.editor_request_end_play()
    log(json.dumps(verification))
    return verification


def main():
    ensure_target_level_is_open()

    blueprint = load_required_asset(CHARACTER_BP_PATH)
    ball_blueprint = load_required_asset(BALL_BP_PATH)
    ball_class = ball_blueprint.generated_class()
    if ball_class is None:
        raise RuntimeError("BP_Football generated class is unavailable")

    ensure_kick_input_assets()
    rebuild_kick_function_graph(blueprint, ball_class)
    rebuild_event_graph(blueprint)
    save_blueprint(blueprint)
    verify_editor_asset_state(blueprint)
    log("Player kick control setup completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Setup failed: {exc}")
        traceback.print_exc()
        raise
