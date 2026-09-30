import json
import traceback
import unreal


MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"
CHARACTER_BP_PATH = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
BALL_BP_PATH = "/Game/Ball/Blueprints/BP_Football"

SYSTEM_DIR = "/Game/Football/GoalSystem"
BLUEPRINT_DIR = f"{SYSTEM_DIR}/Blueprints"

GOAL_TRIGGER_BP_NAME = "BP_EastGoalTrigger"
GOALKEEPER_BP_NAME = "BP_GoalkeeperEast"
GOAL_TRIGGER_LABEL = "FB_EastGoalTrigger_01"
GOALKEEPER_LABEL = "FB_GoalkeeperEast_01"
BALL_LABEL = "OBITREND_Football_01"

BALL_RESET_LOCATION = unreal.Vector(-2540.0, 0.0, 40.0)
PLAYER_RESET_LOCATION = unreal.Vector(-2800.0, 0.0, 120.0)

GOAL_TRIGGER_LOCATION = unreal.Vector(5370.0, 0.0, 120.0)
GOAL_TRIGGER_SCALE = unreal.Vector(0.9, 3.4, 1.6)

GOALKEEPER_LOCATION = unreal.Vector(5130.0, 0.0, 90.0)
GOALKEEPER_SCALE = unreal.Vector(0.9, 1.05, 1.8)
GOALKEEPER_TRACK_X = 5130.0
GOALKEEPER_TRACK_Z = 90.0
GOALKEEPER_TRACK_START_X = 1800.0
GOALKEEPER_Y_LIMIT = 250.0
GOALKEEPER_INTERP_SPEED = 6.0

CUBE_MESH_PATH = "/Engine/BasicShapes/Cube.Cube"
KEEPER_MATERIAL_PATH = "/Game/Football/Stadium/MI_StadiumStand.MI_StadiumStand"


def log(message):
    unreal.log(f"[OBITREND Goal System] {message}")


def ensure_directory(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        unreal.EditorAssetLibrary.make_directory(path)


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
    current_map_path = normalize_package_path(world.get_path_name()) if world else None
    if current_map_path != MAP_PATH:
        world = unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH)
        if world is None:
            raise RuntimeError(f"Failed to load map: {MAP_PATH}")
        current_map_path = normalize_package_path(world.get_path_name())
    if current_map_path != MAP_PATH:
        raise RuntimeError(f"Expected open map '{MAP_PATH}', found '{current_map_path}'")
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


def get_blueprint_generated_class(blueprint):
    generated = blueprint.generated_class() if hasattr(blueprint, "generated_class") else None
    if generated is None:
        try:
            generated = blueprint.get_editor_property("generated_class")
        except Exception:
            generated = None
    return generated


def get_or_create_blueprint(asset_name, parent_class):
    asset_path = f"{BLUEPRINT_DIR}/{asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        blueprint = unreal.load_asset(asset_path)
    else:
        blueprint = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            asset_name,
            BLUEPRINT_DIR,
            None,
            unreal.BlueprintFactory(),
        )
        if blueprint is None:
            raise RuntimeError(f"Failed to create blueprint: {asset_path}")

    if unreal.BlueprintEditorLibrary.get_blueprint_parent_class(blueprint) != parent_class:
        unreal.BlueprintEditorLibrary.reparent_blueprint(blueprint, parent_class)

    return blueprint


def clear_event_graph(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    if event_editor is None:
        raise RuntimeError("Blueprint EventGraph is missing")
    nodes = event_editor.list_all_nodes()
    if nodes:
        event_editor.remove_nodes(nodes)
    return event_editor


def create_goal_trigger_blueprint():
    blueprint = get_or_create_blueprint(GOAL_TRIGGER_BP_NAME, unreal.TriggerBox)
    event_editor = clear_event_graph(blueprint)

    tick_event = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveTick",
        unreal.IntPoint(-1860, -80),
    )
    if tick_event is None:
        raise RuntimeError("Failed to add ReceiveTick to goal trigger")

    get_all_balls_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-1620.0, -80.0),
        [],
    )
    ball_is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-1360.0, -120.0),
        [get_pin(get_all_balls_node, "outactors")],
    )
    has_ball_branch = event_editor.add_branch_node()
    has_ball_branch.set_node_pos(unreal.IntPoint(-1140, -20))

    get_ball_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-1360.0, 140.0),
        [],
    )
    get_ball_location_node = event_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(-1100.0, 140.0),
        [],
    )
    break_ball_location_node = event_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(-850.0, 140.0),
        [],
    )
    x_min_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(-600.0, 20.0),
        [get_pin(break_ball_location_node, "x")],
    )
    x_min_branch = event_editor.add_branch_node()
    x_min_branch.set_node_pos(unreal.IntPoint(-380, 10))
    x_max_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-120.0, 20.0),
        [get_pin(break_ball_location_node, "x")],
    )
    x_max_branch = event_editor.add_branch_node()
    x_max_branch.set_node_pos(unreal.IntPoint(100, 10))
    y_min_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(360.0, 20.0),
        [get_pin(break_ball_location_node, "y")],
    )
    y_min_branch = event_editor.add_branch_node()
    y_min_branch.set_node_pos(unreal.IntPoint(580, 10))
    y_max_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(840.0, 20.0),
        [get_pin(break_ball_location_node, "y")],
    )
    y_max_branch = event_editor.add_branch_node()
    y_max_branch.set_node_pos(unreal.IntPoint(1060, 10))

    print_node = event_editor.create_node_from_name(
        "Development|PrintString",
        unreal.Vector2D(1320.0, -120.0),
        [],
    )
    get_ball_component_node = event_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(1320.0, 80.0),
        [],
    )
    cast_mesh_node = event_editor.create_node_from_name(
        "Utilities|Casting|CastToStaticMeshComponent",
        unreal.Vector2D(1600.0, 80.0),
        [],
    )
    zero_velocity_node = event_editor.create_node_from_name(
        "Physics|SetAllPhysicsLinearVelocity",
        unreal.Vector2D(1880.0, 40.0),
        [],
    )
    disable_sim_node = event_editor.create_node_from_name(
        "Physics|SetSimulatePhysics",
        unreal.Vector2D(2170.0, 40.0),
        [],
    )
    reset_ball_location_node = event_editor.create_node_from_name(
        "Transformation|SetActorLocation",
        unreal.Vector2D(2460.0, 0.0),
        [],
    )
    enable_sim_node = event_editor.create_node_from_name(
        "Physics|SetSimulatePhysics",
        unreal.Vector2D(2750.0, 40.0),
        [],
    )
    wake_ball_node = event_editor.create_node_from_name(
        "Physics|WakeRigidBody",
        unreal.Vector2D(3030.0, 40.0),
        [],
    )
    get_all_players_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(3310.0, 20.0),
        [],
    )
    player_is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(3570.0, -20.0),
        [get_pin(get_all_players_node, "outactors")],
    )
    has_player_branch = event_editor.add_branch_node()
    has_player_branch.set_node_pos(unreal.IntPoint(3800, 50))
    get_player_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(3570.0, 180.0),
        [],
    )
    reset_player_location_node = event_editor.create_node_from_name(
        "Transformation|SetActorLocation",
        unreal.Vector2D(4060.0, 160.0),
        [],
    )

    tick_then = get_pin(tick_event, "then")
    get_all_balls_exec = get_pin(get_all_balls_node, "execute", "exec")
    get_all_balls_class = get_pin(get_all_balls_node, "actorclass")
    get_all_balls_then = get_pin(get_all_balls_node, "then")
    get_all_balls_out = get_pin(get_all_balls_node, "outactors")

    has_ball_exec = get_pin(has_ball_branch, "execute", "exec")
    has_ball_condition = get_pin(has_ball_branch, "condition")
    has_ball_true = get_pin(has_ball_branch, "then")

    get_ball_array = get_pin(get_ball_node, "array", "targetarray")
    get_ball_index = get_pin(get_ball_node, "dimension1", "index")
    get_ball_result = get_pin(get_ball_node, "output", "item", "return")

    ball_location_self = get_pin(get_ball_location_node, "self")
    ball_location_result = get_pin(get_ball_location_node, "return", "result")
    break_ball_input = get_pin(break_ball_location_node, "invec")
    break_ball_x = get_pin(break_ball_location_node, "x")
    break_ball_y = get_pin(break_ball_location_node, "y")

    x_min_a = get_pin(x_min_check_node, "a")
    x_min_b = get_pin(x_min_check_node, "b")
    x_min_result = get_pin(x_min_check_node, "return", "result")
    x_min_branch_exec = get_pin(x_min_branch, "execute", "exec")
    x_min_branch_condition = get_pin(x_min_branch, "condition")
    x_min_branch_true = get_pin(x_min_branch, "then")

    x_max_a = get_pin(x_max_check_node, "a")
    x_max_b = get_pin(x_max_check_node, "b")
    x_max_result = get_pin(x_max_check_node, "return", "result")
    x_max_branch_exec = get_pin(x_max_branch, "execute", "exec")
    x_max_branch_condition = get_pin(x_max_branch, "condition")
    x_max_branch_true = get_pin(x_max_branch, "then")

    y_min_a = get_pin(y_min_check_node, "a")
    y_min_b = get_pin(y_min_check_node, "b")
    y_min_result = get_pin(y_min_check_node, "return", "result")
    y_min_branch_exec = get_pin(y_min_branch, "execute", "exec")
    y_min_branch_condition = get_pin(y_min_branch, "condition")
    y_min_branch_true = get_pin(y_min_branch, "then")

    y_max_a = get_pin(y_max_check_node, "a")
    y_max_b = get_pin(y_max_check_node, "b")
    y_max_result = get_pin(y_max_check_node, "return", "result")
    y_max_branch_exec = get_pin(y_max_branch, "execute", "exec")
    y_max_branch_condition = get_pin(y_max_branch, "condition")
    y_max_branch_true = get_pin(y_max_branch, "then")

    print_exec = get_pin(print_node, "execute", "exec")
    print_then = get_pin(print_node, "then")
    print_text = get_pin(print_node, "instring")
    print_to_screen = get_pin(print_node, "bprinttoscreen")
    print_to_log = get_pin(print_node, "bprinttolog")
    print_duration = get_pin(print_node, "duration")

    get_component_self = get_pin(get_ball_component_node, "self")
    get_component_class = get_pin(get_ball_component_node, "componentclass")
    get_component_return = get_pin(get_ball_component_node, "return", "returnvalue")

    cast_mesh_exec = get_pin(cast_mesh_node, "execute", "exec")
    cast_mesh_object = get_pin(cast_mesh_node, "object")
    cast_mesh_then = get_pin(cast_mesh_node, "then")
    cast_mesh_result = get_pin(cast_mesh_node, "asstaticmeshcomponent")

    zero_velocity_exec = get_pin(zero_velocity_node, "execute", "exec")
    zero_velocity_self = get_pin(zero_velocity_node, "self")
    zero_velocity_value = get_pin(zero_velocity_node, "newvel")
    zero_velocity_add = get_pin(zero_velocity_node, "baddtocurrent")
    zero_velocity_then = get_pin(zero_velocity_node, "then")

    disable_sim_exec = get_pin(disable_sim_node, "execute", "exec")
    disable_sim_self = get_pin(disable_sim_node, "self")
    disable_sim_value = get_pin(disable_sim_node, "bsimulate")
    disable_sim_then = get_pin(disable_sim_node, "then")

    reset_ball_exec = get_pin(reset_ball_location_node, "execute", "exec")
    reset_ball_self = get_pin(reset_ball_location_node, "self")
    reset_ball_location = get_pin(reset_ball_location_node, "newlocation")
    reset_ball_sweep = get_pin(reset_ball_location_node, "bsweep")
    reset_ball_teleport = get_pin(reset_ball_location_node, "bteleport")
    reset_ball_then = get_pin(reset_ball_location_node, "then")

    enable_sim_exec = get_pin(enable_sim_node, "execute", "exec")
    enable_sim_self = get_pin(enable_sim_node, "self")
    enable_sim_value = get_pin(enable_sim_node, "bsimulate")
    enable_sim_then = get_pin(enable_sim_node, "then")

    wake_ball_exec = get_pin(wake_ball_node, "execute", "exec")
    wake_ball_self = get_pin(wake_ball_node, "self")
    wake_ball_then = get_pin(wake_ball_node, "then")

    get_all_players_exec = get_pin(get_all_players_node, "execute", "exec")
    get_all_players_class = get_pin(get_all_players_node, "actorclass")
    get_all_players_out = get_pin(get_all_players_node, "outactors")
    get_all_players_then = get_pin(get_all_players_node, "then")

    ball_is_valid_array = get_pin(ball_is_valid_index_node, "targetarray")
    ball_is_valid_index = get_pin(ball_is_valid_index_node, "index")
    ball_is_valid_result = get_pin(ball_is_valid_index_node, "return", "result")

    has_player_exec = get_pin(has_player_branch, "execute", "exec")
    has_player_condition = get_pin(has_player_branch, "condition")
    has_player_true = get_pin(has_player_branch, "then")

    get_player_array = get_pin(get_player_node, "array", "targetarray")
    get_player_index = get_pin(get_player_node, "dimension1", "index")
    get_player_result = get_pin(get_player_node, "output", "item", "return")

    reset_player_exec = get_pin(reset_player_location_node, "execute", "exec")
    reset_player_self = get_pin(reset_player_location_node, "self")
    reset_player_location = get_pin(reset_player_location_node, "newlocation")
    reset_player_sweep = get_pin(reset_player_location_node, "bsweep")
    reset_player_teleport = get_pin(reset_player_location_node, "bteleport")

    connect(tick_then, get_all_balls_exec, "Tick -> GetAllActorsOfClass balls")
    connect(get_all_balls_then, has_ball_exec, "GetAllActorsOfClass -> HasBall branch")
    connect(get_all_balls_out, ball_is_valid_array, "OutActors -> Ball IsValidIndex")
    connect(ball_is_valid_result, has_ball_condition, "IsValidIndex -> HasBall branch condition")
    connect(get_all_balls_out, get_ball_array, "OutActors -> Get ball array")
    connect(get_ball_result, ball_location_self, "Ball actor -> GetActorLocation")
    connect(ball_location_result, break_ball_input, "Ball location -> BreakVector")
    connect(break_ball_x, x_min_a, "Ball X -> X min check")
    connect(x_min_result, x_min_branch_condition, "X min result -> branch")
    connect(has_ball_true, x_min_branch_exec, "Has ball -> X min branch")
    connect(break_ball_x, x_max_a, "Ball X -> X max check")
    connect(x_max_result, x_max_branch_condition, "X max result -> branch")
    connect(x_min_branch_true, x_max_branch_exec, "X min true -> X max branch")
    connect(break_ball_y, y_min_a, "Ball Y -> Y min check")
    connect(y_min_result, y_min_branch_condition, "Y min result -> branch")
    connect(x_max_branch_true, y_min_branch_exec, "X max true -> Y min branch")
    connect(break_ball_y, y_max_a, "Ball Y -> Y max check")
    connect(y_max_result, y_max_branch_condition, "Y max result -> branch")
    connect(y_min_branch_true, y_max_branch_exec, "Y min true -> Y max branch")
    connect(get_ball_result, get_component_self, "Ball actor -> GetComponentByClass")
    connect(get_component_return, cast_mesh_object, "Component -> CastToStaticMeshComponent")
    connect(y_max_branch_true, print_exec, "Goal confirmed -> PrintString")
    connect(print_then, cast_mesh_exec, "PrintString -> CastToStaticMeshComponent")
    connect(cast_mesh_then, zero_velocity_exec, "Cast mesh -> SetAllPhysicsLinearVelocity")
    connect(cast_mesh_result, zero_velocity_self, "Ball mesh -> SetAllPhysicsLinearVelocity self")
    connect(zero_velocity_then, disable_sim_exec, "Zero velocity -> SetSimulatePhysics false")
    connect(cast_mesh_result, disable_sim_self, "Ball mesh -> SetSimulatePhysics false self")
    connect(disable_sim_then, reset_ball_exec, "Disable sim -> Reset ball location")
    connect(get_ball_result, reset_ball_self, "Ball actor -> SetActorLocation self")
    connect(reset_ball_then, enable_sim_exec, "Reset ball location -> Enable sim")
    connect(cast_mesh_result, enable_sim_self, "Ball mesh -> SetSimulatePhysics true self")
    connect(enable_sim_then, wake_ball_exec, "Enable sim -> WakeRigidBody")
    connect(cast_mesh_result, wake_ball_self, "Ball mesh -> WakeRigidBody self")
    connect(wake_ball_then, get_all_players_exec, "WakeRigidBody -> GetAllActorsOfClass players")
    player_is_valid_array = get_pin(player_is_valid_index_node, "targetarray")
    player_is_valid_index = get_pin(player_is_valid_index_node, "index")
    player_is_valid_result = get_pin(player_is_valid_index_node, "return", "result")
    connect(get_all_players_then, has_player_exec, "GetAllActorsOfClass -> Player branch")
    connect(get_all_players_out, player_is_valid_array, "OutActors -> Player IsValidIndex")
    connect(player_is_valid_result, has_player_condition, "IsValidIndex -> Player branch condition")
    connect(get_all_players_out, get_player_array, "OutActors -> Get player array")
    connect(has_player_true, reset_player_exec, "Has player -> Set player location")
    connect(get_player_result, reset_player_self, "Player actor -> SetActorLocation self")

    set_pin(print_text, "GOAL!")
    set_pin(print_to_screen, "true")
    set_pin(print_to_log, "true")
    set_pin(print_duration, "2.0")
    set_pin(get_all_balls_class, load_required_asset(BALL_BP_PATH).generated_class().get_path_name())
    set_pin(ball_is_valid_index, "0")
    set_pin(get_ball_index, "0")
    set_pin(x_min_b, "5280.0")
    set_pin(x_max_b, "5470.0")
    set_pin(y_min_b, "-340.0")
    set_pin(y_max_b, "340.0")
    set_pin(get_component_class, unreal.StaticMeshComponent.static_class().get_path_name())
    set_pin(zero_velocity_value, "(X=0.0,Y=0.0,Z=0.0)")
    set_pin(zero_velocity_add, "false")
    set_pin(disable_sim_value, "false")
    set_pin(reset_ball_location, f"(X={BALL_RESET_LOCATION.x},Y={BALL_RESET_LOCATION.y},Z={BALL_RESET_LOCATION.z})")
    set_pin(reset_ball_sweep, "false")
    set_pin(reset_ball_teleport, "true")
    set_pin(enable_sim_value, "true")
    set_pin(get_all_players_class, load_required_asset(CHARACTER_BP_PATH).generated_class().get_path_name())
    set_pin(player_is_valid_index, "0")
    set_pin(get_player_index, "0")
    set_pin(reset_player_location, f"(X={PLAYER_RESET_LOCATION.x},Y={PLAYER_RESET_LOCATION.y},Z={PLAYER_RESET_LOCATION.z})")
    set_pin(reset_player_sweep, "false")
    set_pin(reset_player_teleport, "true")

    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Goal trigger blueprint failed to compile")

    return blueprint


def create_goalkeeper_blueprint():
    blueprint = get_or_create_blueprint(GOALKEEPER_BP_NAME, unreal.StaticMeshActor)
    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Initial goalkeeper compile failed")

    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class is None:
        raise RuntimeError("Goalkeeper generated class unavailable")
    cdo = unreal.get_default_object(generated_class)
    mesh_component = cdo.get_editor_property("static_mesh_component")
    if mesh_component is None:
        raise RuntimeError("Goalkeeper mesh component missing")

    mesh_component.set_static_mesh(load_required_asset(CUBE_MESH_PATH))
    try:
        mesh_component.set_material(0, load_required_asset(KEEPER_MATERIAL_PATH))
    except Exception:
        pass
    mesh_component.set_collision_profile_name("BlockAllDynamic")
    mesh_component.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    mesh_component.set_editor_property("relative_scale3d", GOALKEEPER_SCALE)
    mesh_component.set_editor_property("generate_overlap_events", True)
    try:
        mesh_component.set_editor_property("notify_rigid_body_collision", True)
    except Exception:
        pass

    event_editor = clear_event_graph(blueprint)
    tick_event = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveTick",
        unreal.IntPoint(-1800, -80),
    )
    if tick_event is None:
        raise RuntimeError("Failed to add ReceiveTick to goalkeeper")

    get_all_balls_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-1540.0, -80.0),
        [],
    )
    is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-1280.0, -120.0),
        [get_pin(get_all_balls_node, "outactors")],
    )
    has_ball_branch = event_editor.add_branch_node()
    has_ball_branch.set_node_pos(unreal.IntPoint(-1060, -20))

    get_ball_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-1280.0, 150.0),
        [],
    )
    get_ball_location_node = event_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(-1020.0, 150.0),
        [],
    )
    break_ball_location_node = event_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(-770.0, 150.0),
        [],
    )
    ball_x_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(-520.0, 90.0),
        [get_pin(break_ball_location_node, "x")],
    )

    clamp_high_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(-520.0, 230.0),
        [get_pin(break_ball_location_node, "y")],
    )
    clamp_high_select_node = event_editor.create_node_from_name(
        "Math|Float|SelectFloat",
        unreal.Vector2D(-270.0, 230.0),
        [],
    )
    clamp_low_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-20.0, 230.0),
        [get_pin(clamp_high_select_node, "return", "result")],
    )
    clamp_low_select_node = event_editor.create_node_from_name(
        "Math|Float|SelectFloat",
        unreal.Vector2D(230.0, 230.0),
        [],
    )
    track_select_node = event_editor.create_node_from_name(
        "Math|Float|SelectFloat",
        unreal.Vector2D(480.0, 180.0),
        [],
    )

    get_self_location_node = event_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(470.0, -80.0),
        [],
    )
    break_self_location_node = event_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(720.0, -80.0),
        [],
    )
    interp_y_node = event_editor.create_node_from_name(
        "Math|Interpolation|FInterpTo",
        unreal.Vector2D(980.0, 30.0),
        [],
    )
    make_target_location_node = event_editor.create_node_from_name(
        "Math|Vector|MakeVector",
        unreal.Vector2D(1240.0, 0.0),
        [],
    )
    set_keeper_location_node = event_editor.create_node_from_name(
        "Transformation|SetActorLocation",
        unreal.Vector2D(1520.0, -20.0),
        [],
    )

    tick_then = get_pin(tick_event, "then")
    tick_delta = get_pin(tick_event, "deltaseconds", "delta")

    get_all_balls_exec = get_pin(get_all_balls_node, "execute", "exec")
    get_all_balls_class = get_pin(get_all_balls_node, "actorclass")
    get_all_balls_then = get_pin(get_all_balls_node, "then")
    get_all_balls_out = get_pin(get_all_balls_node, "outactors")

    is_valid_array = get_pin(is_valid_index_node, "targetarray")
    is_valid_index = get_pin(is_valid_index_node, "index")
    is_valid_result = get_pin(is_valid_index_node, "return", "result")

    has_ball_exec = get_pin(has_ball_branch, "execute", "exec")
    has_ball_condition = get_pin(has_ball_branch, "condition")
    has_ball_true = get_pin(has_ball_branch, "then")

    get_ball_array = get_pin(get_ball_node, "array", "targetarray")
    get_ball_index = get_pin(get_ball_node, "dimension1", "index")
    get_ball_result = get_pin(get_ball_node, "output", "item", "return")

    ball_location_self = get_pin(get_ball_location_node, "self")
    ball_location_result = get_pin(get_ball_location_node, "return", "result")
    break_ball_input = get_pin(break_ball_location_node, "invec")
    break_ball_x = get_pin(break_ball_location_node, "x")
    break_ball_y = get_pin(break_ball_location_node, "y")

    ball_x_a = get_pin(ball_x_check_node, "a")
    ball_x_b = get_pin(ball_x_check_node, "b")
    ball_x_result = get_pin(ball_x_check_node, "return", "result")

    clamp_high_a = get_pin(clamp_high_check_node, "a")
    clamp_high_b = get_pin(clamp_high_check_node, "b")
    clamp_high_result = get_pin(clamp_high_check_node, "return", "result")
    clamp_high_select_a = get_pin(clamp_high_select_node, "a")
    clamp_high_select_b = get_pin(clamp_high_select_node, "b")
    clamp_high_select_pick = get_pin(clamp_high_select_node, "bpicka")
    clamp_high_select_result = get_pin(clamp_high_select_node, "return", "result")

    clamp_low_a = get_pin(clamp_low_check_node, "a")
    clamp_low_b = get_pin(clamp_low_check_node, "b")
    clamp_low_result = get_pin(clamp_low_check_node, "return", "result")
    clamp_low_select_a = get_pin(clamp_low_select_node, "a")
    clamp_low_select_b = get_pin(clamp_low_select_node, "b")
    clamp_low_select_pick = get_pin(clamp_low_select_node, "bpicka")
    clamp_low_select_result = get_pin(clamp_low_select_node, "return", "result")

    track_select_a = get_pin(track_select_node, "a")
    track_select_b = get_pin(track_select_node, "b")
    track_select_pick = get_pin(track_select_node, "bpicka")
    track_select_result = get_pin(track_select_node, "return", "result")

    self_location_result = get_pin(get_self_location_node, "return", "result")
    break_self_input = get_pin(break_self_location_node, "invec")
    break_self_y = get_pin(break_self_location_node, "y")

    interp_current = get_pin(interp_y_node, "current")
    interp_target = get_pin(interp_y_node, "target")
    interp_delta = get_pin(interp_y_node, "deltatime")
    interp_speed = get_pin(interp_y_node, "interpspeed")
    interp_result = get_pin(interp_y_node, "return", "result")

    make_target_x = get_pin(make_target_location_node, "x")
    make_target_y = get_pin(make_target_location_node, "y")
    make_target_z = get_pin(make_target_location_node, "z")
    make_target_result = get_pin(make_target_location_node, "return", "result")

    set_keeper_exec = get_pin(set_keeper_location_node, "execute", "exec")
    set_keeper_self = get_pin(set_keeper_location_node, "self")
    set_keeper_location = get_pin(set_keeper_location_node, "newlocation")
    set_keeper_sweep = get_pin(set_keeper_location_node, "bsweep")
    set_keeper_teleport = get_pin(set_keeper_location_node, "bteleport")

    connect(tick_then, get_all_balls_exec, "Tick -> GetAllActorsOfClass balls")
    connect(get_all_balls_then, has_ball_exec, "GetAllActorsOfClass -> Ball branch")
    connect(get_all_balls_out, is_valid_array, "OutActors -> IsValidIndex")
    connect(is_valid_result, has_ball_condition, "IsValidIndex -> Ball branch condition")
    connect(get_all_balls_out, get_ball_array, "OutActors -> Get ball array")

    connect(get_ball_result, ball_location_self, "Ball actor -> GetActorLocation")
    connect(ball_location_result, break_ball_input, "Ball location -> BreakVector")
    connect(break_ball_x, ball_x_a, "Ball X -> Track X check")
    connect(break_ball_y, clamp_high_a, "Ball Y -> Clamp high check")
    connect(break_ball_y, clamp_high_select_b, "Ball Y -> Clamp high select B")
    connect(clamp_high_result, clamp_high_select_pick, "Clamp high condition -> SelectFloat")
    connect(clamp_high_select_result, clamp_low_a, "Clamped high Y -> Clamp low check")
    connect(clamp_high_select_result, clamp_low_select_b, "Clamped high Y -> Clamp low select B")
    connect(clamp_low_result, clamp_low_select_pick, "Clamp low condition -> SelectFloat")
    connect(clamp_low_select_result, track_select_a, "Clamped Y -> Track select A")
    connect(ball_x_result, track_select_pick, "Track X bool -> Track select pick")

    connect(self_location_result, break_self_input, "Self location -> BreakVector")
    connect(break_self_y, interp_current, "Current Y -> FInterpTo current")
    connect(track_select_result, interp_target, "Target Y -> FInterpTo target")
    connect(tick_delta, interp_delta, "DeltaSeconds -> FInterpTo delta")
    connect(interp_result, make_target_y, "Interpolated Y -> MakeVector Y")
    connect(make_target_result, set_keeper_location, "Target location -> SetActorLocation")

    connect(has_ball_true, set_keeper_exec, "Has ball -> SetActorLocation execute")

    set_pin(get_all_balls_class, load_required_asset(BALL_BP_PATH).generated_class().get_path_name())
    set_pin(is_valid_index, "0")
    set_pin(get_ball_index, "0")
    set_pin(ball_x_b, str(GOALKEEPER_TRACK_START_X))
    set_pin(clamp_high_b, str(GOALKEEPER_Y_LIMIT))
    set_pin(clamp_high_select_a, str(GOALKEEPER_Y_LIMIT))
    set_pin(clamp_low_b, str(-GOALKEEPER_Y_LIMIT))
    set_pin(clamp_low_select_a, str(-GOALKEEPER_Y_LIMIT))
    set_pin(track_select_b, "0.0")
    set_pin(interp_speed, str(GOALKEEPER_INTERP_SPEED))
    set_pin(make_target_x, str(GOALKEEPER_TRACK_X))
    set_pin(make_target_z, str(GOALKEEPER_TRACK_Z))
    set_pin(set_keeper_sweep, "true")
    set_pin(set_keeper_teleport, "false")

    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Goalkeeper blueprint failed to compile")

    return blueprint


def ensure_single_actor(label, actor_class, location, rotation, scale=None):
    actors = [actor for actor in unreal.EditorLevelLibrary.get_all_level_actors() if actor.get_actor_label() == label]
    actor = actors[0] if actors else None
    for extra in actors[1:]:
        unreal.EditorLevelLibrary.destroy_actor(extra)

    if actor is None:
        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)
        if actor is None:
            raise RuntimeError(f"Failed to spawn actor: {label}")

    actor.set_actor_label(label, mark_dirty=True)
    actor.set_actor_location(location, False, False)
    actor.set_actor_rotation(rotation, False)
    if scale is not None:
        actor.set_actor_scale3d(scale)
    return actor


def place_system_actors(goal_trigger_blueprint, goalkeeper_blueprint):
    goal_trigger_class = get_blueprint_generated_class(goal_trigger_blueprint)
    goalkeeper_class = get_blueprint_generated_class(goalkeeper_blueprint)
    if goal_trigger_class is None or goalkeeper_class is None:
        raise RuntimeError("Generated classes unavailable for system actors")

    trigger_actor = ensure_single_actor(
        GOAL_TRIGGER_LABEL,
        goal_trigger_class,
        GOAL_TRIGGER_LOCATION,
        unreal.Rotator(0.0, 0.0, 0.0),
        GOAL_TRIGGER_SCALE,
    )
    goalkeeper_actor = ensure_single_actor(
        GOALKEEPER_LABEL,
        goalkeeper_class,
        GOALKEEPER_LOCATION,
        unreal.Rotator(0.0, 180.0, 0.0),
        None,
    )
    return trigger_actor, goalkeeper_actor


def save_assets_and_map(assets):
    packages = []
    for asset in assets:
        if asset:
            packages.append(asset.get_outermost())

    if packages and not unreal.EditorLoadingAndSavingUtils.save_packages(packages, True):
        raise RuntimeError("Failed to save goal system assets")

    world = ensure_target_level_is_open()
    if not unreal.EditorLoadingAndSavingUtils.save_map(world, MAP_PATH):
        raise RuntimeError("Failed to save Lvl_ThirdPerson")


def verify_editor_state(goal_trigger_blueprint, goalkeeper_blueprint):
    actors = unreal.EditorLevelLibrary.get_all_level_actors()
    trigger_actors = [a for a in actors if a.get_actor_label() == GOAL_TRIGGER_LABEL]
    keeper_actors = [a for a in actors if a.get_actor_label() == GOALKEEPER_LABEL]
    balls = [a for a in actors if a.get_actor_label() == BALL_LABEL]

    trigger_graph = unreal.BlueprintGraphEditor.get_graph_editor_by_name(goal_trigger_blueprint, "EventGraph")
    keeper_graph = unreal.BlueprintGraphEditor.get_graph_editor_by_name(goalkeeper_blueprint, "EventGraph")
    dirty_content = [str(pkg.get_name()) for pkg in unreal.EditorLoadingAndSavingUtils.get_dirty_content_packages()]
    dirty_maps = [str(pkg.get_name()) for pkg in unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages()]

    verification = {
        "trigger_count": len(trigger_actors),
        "keeper_count": len(keeper_actors),
        "ball_count": len(balls),
        "trigger_event_titles": [node.get_node_title() for node in trigger_graph.list_all_nodes()],
        "keeper_event_titles": [node.get_node_title() for node in keeper_graph.list_all_nodes()],
        "dirty_content": dirty_content,
        "dirty_maps": dirty_maps,
    }
    log(json.dumps(verification))
    return verification


def main():
    ensure_directory(SYSTEM_DIR)
    ensure_directory(BLUEPRINT_DIR)
    ensure_target_level_is_open()

    goal_trigger_blueprint = create_goal_trigger_blueprint()
    goalkeeper_blueprint = create_goalkeeper_blueprint()
    place_system_actors(goal_trigger_blueprint, goalkeeper_blueprint)
    save_assets_and_map([goal_trigger_blueprint, goalkeeper_blueprint])
    verify_editor_state(goal_trigger_blueprint, goalkeeper_blueprint)
    log("Goal + goalkeeper system setup completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Setup failed: {exc}")
        traceback.print_exc()
        raise
