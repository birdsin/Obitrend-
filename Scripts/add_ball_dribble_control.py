import json
import traceback
import unreal


BALL_BP_PATH = "/Game/Ball/Blueprints/BP_Football"
CHARACTER_BP_PATH = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"

FUNCTION_NAME = "UpdateBallControl"
RELEASE_FUNCTION_NAME = "SuspendBallControl"
CONTROL_SUPPRESS_UNTIL_VAR = "ControlSuppressedUntilTime"
CONTROL_RADIUS = 245.0
CONTROL_AHEAD_DISTANCE = 165.0
CONTROL_SPEED = 360.0
CONTROL_MAX_SPEED = 500.0
CONTROL_RELEASE_SECONDS = 0.85

FLOAT_PIN_TYPE_TEXT = (
    '(PinCategory="real",PinSubCategory="float",PinSubCategoryObject=None,'
    'PinSubCategoryMemberReference=(MemberParent=None,MemberName="",MemberGuid=00000000000000000000000000000000),'
    'PinValueType=(TerminalCategory="",TerminalSubCategory="",TerminalSubCategoryObject=None,'
    'bTerminalIsConst=False,bTerminalIsWeakPointer=False,bTerminalIsUObjectWrapper=False),'
    'ContainerType=None,bIsReference=False,bIsConst=False,bIsWeakPointer=False,'
    'bIsUObjectWrapper=False,bSerializeAsSinglePrecisionFloat=False)'
)


def log(message):
    unreal.log(f"[OBITREND Ball Dribble] {message}")


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
        log("Editor world handle is unavailable in remote context; continuing with asset changes.")
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


def make_pin_type(pin_type_text):
    pin_type = unreal.EdGraphPinType()
    pin_type.import_text(pin_type_text)
    return pin_type


def ensure_member_variable(blueprint, variable_name, pin_type_text):
    existing = [str(name) for name in unreal.BlueprintEditorLibrary.list_member_variable_names(blueprint)]
    if variable_name in existing:
        return

    if not unreal.BlueprintEditorLibrary.add_member_variable(
        blueprint,
        variable_name,
        make_pin_type(pin_type_text),
    ):
        raise RuntimeError(f"Failed to add member variable: {variable_name}")


def rebuild_suspend_control_function(blueprint):
    function_editor = get_or_create_function_editor(blueprint, RELEASE_FUNCTION_NAME)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {RELEASE_FUNCTION_NAME}")

    function_editor.set_function_is_public()

    nodes = function_editor.list_all_nodes()
    entry_node = None
    removable_nodes = []
    for node in nodes:
        if node.get_node_title() == RELEASE_FUNCTION_NAME:
            entry_node = node
        else:
            removable_nodes.append(node)

    if entry_node is None:
        raise RuntimeError(f"Function entry node not found for {RELEASE_FUNCTION_NAME}")

    if removable_nodes:
        function_editor.remove_nodes(removable_nodes)

    get_game_time_node = function_editor.create_node_from_name(
        "Utilities|Time|GetGameTimeinSeconds",
        unreal.Vector2D(-740.0, -20.0),
        [],
    )
    add_release_window_node = function_editor.create_node_from_name(
        "Utilities|Operators|Add",
        unreal.Vector2D(-470.0, -40.0),
        [get_pin(get_game_time_node, "return", "result")],
    )
    set_suppressed_until_node = function_editor.add_set_member_variable_node(CONTROL_SUPPRESS_UNTIL_VAR)
    set_suppressed_until_node.set_node_pos(unreal.IntPoint(-130, -60))

    connect(get_pin(entry_node, "then"), get_pin(set_suppressed_until_node, "execute", "exec"), "SuspendBallControl -> Set ControlSuppressedUntilTime")
    connect(get_pin(add_release_window_node, "return", "result"), get_pin(set_suppressed_until_node, "controlsuppresseduntiltime"), "Release window -> Set ControlSuppressedUntilTime")

    set_pin(get_pin(add_release_window_node, "b"), str(CONTROL_RELEASE_SECONDS))

    log("Rebuilt SuspendBallControl function graph.")


def rebuild_ball_control_function(blueprint, character_class):
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

    get_game_time_node = function_editor.create_node_from_name(
        "Utilities|Time|GetGameTimeinSeconds",
        unreal.Vector2D(-1780.0, -250.0),
        [],
    )
    get_suppressed_until_node = function_editor.add_get_member_variable_node(CONTROL_SUPPRESS_UNTIL_VAR)
    get_suppressed_until_node.set_node_pos(unreal.IntPoint(-1520, -300))
    suppress_check_node = function_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-1260.0, -260.0),
        [get_pin(get_game_time_node, "return", "result")],
    )
    branch_is_suppressed = function_editor.add_branch_node()
    branch_is_suppressed.set_node_pos(unreal.IntPoint(-1040, -200))

    get_all_players_node = function_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-1520.0, -40.0),
        [],
    )
    is_valid_index_node = function_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-1260.0, -80.0),
        [get_pin(get_all_players_node, "outactors")],
    )
    branch_has_player = function_editor.add_branch_node()
    branch_has_player.set_node_pos(unreal.IntPoint(-1040, -20))

    get_player_node = function_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-1260.0, 170.0),
        [],
    )
    get_distance_node = function_editor.create_node_from_name(
        "Transformation|GetDistanceTo",
        unreal.Vector2D(-980.0, 170.0),
        [],
    )
    distance_check_node = function_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-720.0, 170.0),
        [get_pin(get_distance_node, "return", "distance")],
    )
    branch_is_close = function_editor.add_branch_node()
    branch_is_close.set_node_pos(unreal.IntPoint(-500, 90))

    get_mesh_node = function_editor.create_node_from_name(
        "Variables|StaticMeshActor|GetStaticMeshComponent",
        unreal.Vector2D(-240.0, 360.0),
        [],
    )
    get_velocity_node = function_editor.create_node_from_name(
        "Physics|GetPhysicsLinearVelocity",
        unreal.Vector2D(-240.0, 120.0),
        [get_pin(get_mesh_node, "staticmeshcomponent", "static_mesh_component")],
    )
    get_speed_node = function_editor.create_node_from_name(
        "Math|Vector|VectorLength",
        unreal.Vector2D(30.0, 170.0),
        [get_pin(get_velocity_node, "return", "result")],
    )
    speed_check_node = function_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(260.0, 170.0),
        [get_pin(get_speed_node, "return", "result")],
    )
    branch_can_control = function_editor.add_branch_node()
    branch_can_control.set_node_pos(unreal.IntPoint(500, 90))

    get_forward_node = function_editor.create_node_from_name(
        "Transformation|GetActorForwardVector",
        unreal.Vector2D(40.0, -270.0),
        [],
    )
    break_forward_node = function_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(300.0, -300.0),
        [],
    )
    multiply_forward_x_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(540.0, -380.0),
        [get_pin(break_forward_node, "x")],
    )
    multiply_forward_y_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(540.0, -240.0),
        [get_pin(break_forward_node, "y")],
    )

    get_player_location_node = function_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(40.0, -40.0),
        [],
    )
    break_player_location_node = function_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(300.0, -70.0),
        [],
    )
    add_target_x_node = function_editor.create_node_from_name(
        "Utilities|Operators|Add",
        unreal.Vector2D(820.0, -260.0),
        [get_pin(break_player_location_node, "x")],
    )
    add_target_y_node = function_editor.create_node_from_name(
        "Utilities|Operators|Add",
        unreal.Vector2D(820.0, -120.0),
        [get_pin(break_player_location_node, "y")],
    )

    get_ball_location_node = function_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(1080.0, 40.0),
        [],
    )
    break_ball_location_node = function_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(1340.0, 10.0),
        [],
    )
    subtract_delta_x_node = function_editor.create_node_from_name(
        "Utilities|Operators|Subtract",
        unreal.Vector2D(1100.0, -260.0),
        [get_pin(add_target_x_node, "return", "result")],
    )
    subtract_delta_y_node = function_editor.create_node_from_name(
        "Utilities|Operators|Subtract",
        unreal.Vector2D(1100.0, -120.0),
        [get_pin(add_target_y_node, "return", "result")],
    )

    make_delta_node = function_editor.create_node_from_name(
        "Math|Vector|MakeVector",
        unreal.Vector2D(1400.0, -190.0),
        [],
    )
    normalize_delta_node = function_editor.create_node_from_name(
        "Math|Vector|Normalize",
        unreal.Vector2D(1630.0, -190.0),
        [get_pin(make_delta_node, "return", "result")],
    )
    break_normalized_node = function_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(1870.0, -190.0),
        [],
    )

    multiply_velocity_x_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(2120.0, -260.0),
        [get_pin(break_normalized_node, "x")],
    )
    multiply_velocity_y_node = function_editor.create_node_from_name(
        "Utilities|Operators|Multiply",
        unreal.Vector2D(2120.0, -120.0),
        [get_pin(break_normalized_node, "y")],
    )
    make_velocity_node = function_editor.create_node_from_name(
        "Math|Vector|MakeVector",
        unreal.Vector2D(2380.0, -190.0),
        [],
    )
    set_velocity_node = function_editor.create_node_from_name(
        "Physics|SetPhysicsLinearVelocity",
        unreal.Vector2D(2640.0, -110.0),
        [get_pin(get_mesh_node, "staticmeshcomponent", "static_mesh_component")],
    )

    if None in (
        get_all_players_node,
        is_valid_index_node,
        branch_has_player,
        get_player_node,
        get_distance_node,
        distance_check_node,
        branch_is_close,
        get_mesh_node,
        get_velocity_node,
        get_speed_node,
        speed_check_node,
        branch_can_control,
        get_forward_node,
        break_forward_node,
        multiply_forward_x_node,
        multiply_forward_y_node,
        get_player_location_node,
        break_player_location_node,
        add_target_x_node,
        add_target_y_node,
        get_ball_location_node,
        break_ball_location_node,
        subtract_delta_x_node,
        subtract_delta_y_node,
        make_delta_node,
        normalize_delta_node,
        break_normalized_node,
        multiply_velocity_x_node,
        multiply_velocity_y_node,
        make_velocity_node,
        set_velocity_node,
        get_game_time_node,
        get_suppressed_until_node,
        suppress_check_node,
        branch_is_suppressed,
    ):
        raise RuntimeError("Failed to create one or more UpdateBallControl nodes")

    entry_then = get_pin(entry_node, "then")
    suppress_check_a = get_pin(suppress_check_node, "a")
    suppress_check_b = get_pin(suppress_check_node, "b")
    suppress_check_result = get_pin(suppress_check_node, "return", "result")
    branch_is_suppressed_exec = get_pin(branch_is_suppressed, "execute", "exec")
    branch_is_suppressed_condition = get_pin(branch_is_suppressed, "condition")
    branch_is_suppressed_false = get_pin(branch_is_suppressed, "else")
    get_all_exec = get_pin(get_all_players_node, "execute", "exec")
    get_all_then = get_pin(get_all_players_node, "then")
    get_all_class = get_pin(get_all_players_node, "actorclass")
    get_all_out = get_pin(get_all_players_node, "outactors")

    is_valid_array = get_pin(is_valid_index_node, "targetarray")
    is_valid_index = get_pin(is_valid_index_node, "index")
    is_valid_result = get_pin(is_valid_index_node, "return", "result")

    branch_has_player_exec = get_pin(branch_has_player, "execute", "exec")
    branch_has_player_condition = get_pin(branch_has_player, "condition")
    branch_has_player_true = get_pin(branch_has_player, "then")

    get_player_array = get_pin(get_player_node, "array", "targetarray")
    get_player_index = get_pin(get_player_node, "dimension1", "index")
    get_player_result = get_pin(get_player_node, "output", "item", "return")

    distance_other = get_pin(get_distance_node, "otheractor")
    distance_value = get_pin(get_distance_node, "return", "distance")
    distance_check_a = get_pin(distance_check_node, "a")
    distance_check_b = get_pin(distance_check_node, "b")
    distance_check_result = get_pin(distance_check_node, "return", "result")

    branch_is_close_exec = get_pin(branch_is_close, "execute", "exec")
    branch_is_close_condition = get_pin(branch_is_close, "condition")
    branch_is_close_true = get_pin(branch_is_close, "then")

    mesh_result = get_pin(get_mesh_node, "staticmeshcomponent", "static_mesh_component")
    get_velocity_exec = get_pin(get_velocity_node, "execute", "exec")
    get_velocity_self = get_pin(get_velocity_node, "self")
    get_velocity_then = get_pin(get_velocity_node, "then")
    get_velocity_result = get_pin(get_velocity_node, "return", "result")
    get_speed_a = get_pin(get_speed_node, "a")
    get_speed_result = get_pin(get_speed_node, "return", "result")
    speed_check_a = get_pin(speed_check_node, "a")
    speed_check_b = get_pin(speed_check_node, "b")
    speed_check_result = get_pin(speed_check_node, "return", "result")

    branch_can_control_exec = get_pin(branch_can_control, "execute", "exec")
    branch_can_control_condition = get_pin(branch_can_control, "condition")
    branch_can_control_true = get_pin(branch_can_control, "then")

    forward_target = get_pin(get_forward_node, "self")
    forward_result = get_pin(get_forward_node, "return", "result")
    break_forward_input = get_pin(break_forward_node, "invec")
    break_forward_x = get_pin(break_forward_node, "x")
    break_forward_y = get_pin(break_forward_node, "y")
    multiply_forward_x_a = get_pin(multiply_forward_x_node, "a")
    multiply_forward_x_b = get_pin(multiply_forward_x_node, "b")
    multiply_forward_x_result = get_pin(multiply_forward_x_node, "return", "result")
    multiply_forward_y_a = get_pin(multiply_forward_y_node, "a")
    multiply_forward_y_b = get_pin(multiply_forward_y_node, "b")
    multiply_forward_y_result = get_pin(multiply_forward_y_node, "return", "result")

    player_location_target = get_pin(get_player_location_node, "self")
    player_location_result = get_pin(get_player_location_node, "return", "result")
    break_player_location_input = get_pin(break_player_location_node, "invec")
    break_player_location_x = get_pin(break_player_location_node, "x")
    break_player_location_y = get_pin(break_player_location_node, "y")
    add_target_x_a = get_pin(add_target_x_node, "a")
    add_target_x_b = get_pin(add_target_x_node, "b")
    add_target_x_result = get_pin(add_target_x_node, "return", "result")
    add_target_y_a = get_pin(add_target_y_node, "a")
    add_target_y_b = get_pin(add_target_y_node, "b")
    add_target_y_result = get_pin(add_target_y_node, "return", "result")

    ball_location_result = get_pin(get_ball_location_node, "return", "result")
    break_ball_location_input = get_pin(break_ball_location_node, "invec")
    break_ball_location_x = get_pin(break_ball_location_node, "x")
    break_ball_location_y = get_pin(break_ball_location_node, "y")
    subtract_delta_x_a = get_pin(subtract_delta_x_node, "a")
    subtract_delta_x_b = get_pin(subtract_delta_x_node, "b")
    subtract_delta_x_result = get_pin(subtract_delta_x_node, "return", "result")
    subtract_delta_y_a = get_pin(subtract_delta_y_node, "a")
    subtract_delta_y_b = get_pin(subtract_delta_y_node, "b")
    subtract_delta_y_result = get_pin(subtract_delta_y_node, "return", "result")

    make_delta_x = get_pin(make_delta_node, "x")
    make_delta_y = get_pin(make_delta_node, "y")
    make_delta_z = get_pin(make_delta_node, "z")
    make_delta_result = get_pin(make_delta_node, "return", "result")
    normalize_a = get_pin(normalize_delta_node, "a")
    normalize_tolerance = get_pin(normalize_delta_node, "tolerance")
    normalize_result = get_pin(normalize_delta_node, "return", "result")
    break_normalized_input = get_pin(break_normalized_node, "invec")
    break_normalized_x = get_pin(break_normalized_node, "x")
    break_normalized_y = get_pin(break_normalized_node, "y")

    multiply_velocity_x_a = get_pin(multiply_velocity_x_node, "a")
    multiply_velocity_x_b = get_pin(multiply_velocity_x_node, "b")
    multiply_velocity_x_result = get_pin(multiply_velocity_x_node, "return", "result")
    multiply_velocity_y_a = get_pin(multiply_velocity_y_node, "a")
    multiply_velocity_y_b = get_pin(multiply_velocity_y_node, "b")
    multiply_velocity_y_result = get_pin(multiply_velocity_y_node, "return", "result")

    make_velocity_x = get_pin(make_velocity_node, "x")
    make_velocity_y = get_pin(make_velocity_node, "y")
    make_velocity_z = get_pin(make_velocity_node, "z")
    make_velocity_result = get_pin(make_velocity_node, "return", "result")
    set_velocity_exec = get_pin(set_velocity_node, "execute", "exec")
    set_velocity_self = get_pin(set_velocity_node, "self")
    set_velocity_new_vel = get_pin(set_velocity_node, "newvel")
    set_velocity_add = get_pin(set_velocity_node, "baddtocurrent")

    connect(entry_then, branch_is_suppressed_exec, "UpdateBallControl -> Suppressed branch")
    connect(get_pin(get_game_time_node, "return", "result"), suppress_check_a, "GameTime -> suppression check A")
    connect(get_pin(get_suppressed_until_node, "controlsuppresseduntiltime"), suppress_check_b, "ControlSuppressedUntilTime -> suppression check B")
    connect(suppress_check_result, branch_is_suppressed_condition, "Suppression check -> branch condition")
    connect(branch_is_suppressed_false, get_all_exec, "Control active -> GetAllActorsOfClass")
    connect(get_all_then, branch_has_player_exec, "GetAllActorsOfClass -> HasPlayer branch")
    connect(get_all_out, is_valid_array, "OutActors -> IsValidIndex array")
    connect(is_valid_result, branch_has_player_condition, "HasPlayer condition")
    connect(get_all_out, get_player_array, "OutActors -> Get player array")
    connect(branch_has_player_true, branch_is_close_exec, "HasPlayer true -> IsClose branch")
    connect(get_player_result, distance_other, "Player actor -> GetDistanceTo other actor")
    connect(distance_value, distance_check_a, "Distance -> float < float A")
    connect(distance_check_result, branch_is_close_condition, "Distance check -> IsClose branch condition")

    connect(branch_is_close_true, get_velocity_exec, "IsClose true -> GetPhysicsLinearVelocity execute")
    connect(mesh_result, get_velocity_self, "Static mesh -> GetPhysicsLinearVelocity self")
    connect(get_velocity_result, get_speed_a, "Velocity -> VectorLength")
    connect(get_speed_result, speed_check_a, "Speed -> float < float A")
    connect(get_velocity_then, branch_can_control_exec, "GetPhysicsLinearVelocity -> CanControl branch")
    connect(speed_check_result, branch_can_control_condition, "Speed check -> CanControl branch condition")

    connect(get_player_result, forward_target, "Player actor -> GetActorForwardVector target")
    connect(forward_result, break_forward_input, "Forward vector -> BreakVector")
    connect(break_forward_x, multiply_forward_x_a, "Forward X -> Multiply X")
    connect(break_forward_y, multiply_forward_y_a, "Forward Y -> Multiply Y")

    connect(get_player_result, player_location_target, "Player actor -> GetActorLocation target")
    connect(player_location_result, break_player_location_input, "Player location -> BreakVector")
    connect(break_player_location_x, add_target_x_a, "Player X -> Add target X")
    connect(multiply_forward_x_result, add_target_x_b, "Forward offset X -> Add target X")
    connect(break_player_location_y, add_target_y_a, "Player Y -> Add target Y")
    connect(multiply_forward_y_result, add_target_y_b, "Forward offset Y -> Add target Y")

    connect(ball_location_result, break_ball_location_input, "Ball location -> BreakVector")
    connect(add_target_x_result, subtract_delta_x_a, "Target X -> Delta X")
    connect(break_ball_location_x, subtract_delta_x_b, "Ball X -> Delta X")
    connect(add_target_y_result, subtract_delta_y_a, "Target Y -> Delta Y")
    connect(break_ball_location_y, subtract_delta_y_b, "Ball Y -> Delta Y")

    connect(subtract_delta_x_result, make_delta_x, "Delta X -> MakeVector X")
    connect(subtract_delta_y_result, make_delta_y, "Delta Y -> MakeVector Y")
    connect(make_delta_result, normalize_a, "Delta vector -> Normalize")
    connect(normalize_result, break_normalized_input, "Normalized delta -> BreakVector")
    connect(break_normalized_x, multiply_velocity_x_a, "Normalized X -> Velocity X")
    connect(break_normalized_y, multiply_velocity_y_a, "Normalized Y -> Velocity Y")
    connect(multiply_velocity_x_result, make_velocity_x, "Velocity X -> MakeVector X")
    connect(multiply_velocity_y_result, make_velocity_y, "Velocity Y -> MakeVector Y")

    connect(branch_can_control_true, set_velocity_exec, "CanControl true -> SetPhysicsLinearVelocity execute")
    connect(mesh_result, set_velocity_self, "Static mesh -> SetPhysicsLinearVelocity self")
    connect(make_velocity_result, set_velocity_new_vel, "Control velocity -> SetPhysicsLinearVelocity")

    set_pin(get_all_class, character_class.get_path_name())
    set_pin(is_valid_index, "0")
    set_pin(get_player_index, "0")
    set_pin(distance_check_b, str(CONTROL_RADIUS))
    set_pin(speed_check_b, str(CONTROL_MAX_SPEED))
    set_pin(multiply_forward_x_b, str(CONTROL_AHEAD_DISTANCE))
    set_pin(multiply_forward_y_b, str(CONTROL_AHEAD_DISTANCE))
    set_pin(make_delta_z, "0.0")
    set_pin(normalize_tolerance, "0.001")
    set_pin(multiply_velocity_x_b, str(CONTROL_SPEED))
    set_pin(multiply_velocity_y_b, str(CONTROL_SPEED))
    set_pin(make_velocity_z, "0.0")
    set_pin(set_velocity_add, "false")

    log("Rebuilt UpdateBallControl function graph.")


def rebuild_ball_event_graph(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    if event_editor is None:
        raise RuntimeError("BP_Football EventGraph is missing")

    removable_nodes = []
    for node in event_editor.list_all_nodes():
        title = node.get_node_title()
        if title in {"Event Tick", FUNCTION_NAME}:
            removable_nodes.append(node)

    if removable_nodes:
        event_editor.remove_nodes(removable_nodes)

    tick_event_node = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveTick",
        unreal.IntPoint(240, -520),
    )
    if tick_event_node is None:
        raise RuntimeError("Failed to add ReceiveTick override to BP_Football")

    tick_event_node.set_node_pos(unreal.IntPoint(240, -520))

    call_control_node = event_editor.create_node_from_name(
        f"CallFunction|{FUNCTION_NAME}",
        unreal.Vector2D(520.0, -520.0),
        [],
    )
    if call_control_node is None:
        raise RuntimeError("Failed to create UpdateBallControl call node")

    connect(
        get_pin(tick_event_node, "then"),
        get_pin(call_control_node, "execute", "exec"),
        "Event Tick -> UpdateBallControl",
    )

    log("Rebuilt EventGraph dribble-control nodes.")


def save_blueprint(blueprint):
    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("BP_Football failed to compile after dribble changes")

    package = blueprint.get_outermost()
    if package is None:
        raise RuntimeError("BP_Football package is unavailable for save")

    if not unreal.EditorLoadingAndSavingUtils.save_packages([package], True):
        raise RuntimeError("Failed to save BP_Football")


def verify_editor_asset_state(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    control_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, FUNCTION_NAME)
    release_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, RELEASE_FUNCTION_NAME)
    generated_class = blueprint.generated_class()
    cdo = unreal.get_default_object(generated_class) if generated_class else None
    mesh_component = cdo.get_editor_property("static_mesh_component") if cdo else None

    event_titles = [node.get_node_title() for node in event_editor.list_all_nodes()]
    control_titles = [node.get_node_title() for node in control_editor.list_all_nodes()]
    release_titles = [node.get_node_title() for node in release_editor.list_all_nodes()] if release_editor else []

    verification = {
        "event_graph_titles": event_titles,
        "control_graph_titles": control_titles,
        "release_graph_titles": release_titles,
        "has_tick_event": "Event Tick" in event_titles,
        "has_control_call": FUNCTION_NAME in event_titles,
        "has_set_velocity": "SetPhysicsLinearVelocity" in control_titles,
        "has_get_velocity": "GetPhysicsLinearVelocity" in control_titles,
        "has_suspend_control": RELEASE_FUNCTION_NAME in release_titles,
        "control_radius": CONTROL_RADIUS,
        "control_ahead_distance": CONTROL_AHEAD_DISTANCE,
        "control_speed": CONTROL_SPEED,
        "control_max_speed": CONTROL_MAX_SPEED,
        "control_release_seconds": CONTROL_RELEASE_SECONDS,
        "simulate_physics": bool(mesh_component.is_simulating_physics()) if mesh_component else None,
        "collision_profile": str(mesh_component.get_collision_profile_name()) if mesh_component else None,
    }
    log(json.dumps(verification))
    return verification


def main():
    ensure_target_level_is_open()

    ball_blueprint = load_required_asset(BALL_BP_PATH)
    character_blueprint = load_required_asset(CHARACTER_BP_PATH)
    character_class = character_blueprint.generated_class()
    if character_class is None:
        raise RuntimeError("BP_ThirdPersonCharacter generated class is unavailable")

    ensure_member_variable(ball_blueprint, CONTROL_SUPPRESS_UNTIL_VAR, FLOAT_PIN_TYPE_TEXT)
    rebuild_suspend_control_function(ball_blueprint)
    rebuild_ball_control_function(ball_blueprint, character_class)
    rebuild_ball_event_graph(ball_blueprint)
    save_blueprint(ball_blueprint)
    verify_editor_asset_state(ball_blueprint)
    log("Ball dribble/control setup completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Setup failed: {exc}")
        traceback.print_exc()
        raise
