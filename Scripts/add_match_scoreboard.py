import json
import time
import traceback
import unreal


MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"
CHARACTER_BP_PATH = "/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter"
BALL_BP_PATH = "/Game/Ball/Blueprints/BP_Football"
GOAL_TRIGGER_BP_PATH = "/Game/Football/GoalSystem/Blueprints/BP_EastGoalTrigger"
WEST_GOAL_TRIGGER_BP_NAME = "BP_WestGoalTrigger"
WEST_GOAL_TRIGGER_BP_PATH = f"/Game/Football/GoalSystem/Blueprints/{WEST_GOAL_TRIGGER_BP_NAME}"

SYSTEM_DIR = "/Game/Football/UI"
BLUEPRINT_DIR = f"{SYSTEM_DIR}/Blueprints"
SCOREBOARD_BP_NAME = "BP_MatchScoreboard"
SCOREBOARD_BP_PATH = f"{BLUEPRINT_DIR}/{SCOREBOARD_BP_NAME}"
SCOREBOARD_LABEL = "FB_MatchScoreboard_01"
BALL_LABEL = "OBITREND_Football_01"
WEST_GOAL_TRIGGER_LABEL = "FB_WestGoalTrigger_01"

BALL_RESET_LOCATION = unreal.Vector(-2540.0, 0.0, 40.0)
PLAYER_RESET_LOCATION = unreal.Vector(-2800.0, 0.0, 120.0)
GOAL_TEST_LOCATION = unreal.Vector(5385.0, 0.0, 40.0)
AWAY_GOAL_TEST_LOCATION = unreal.Vector(-5385.0, 0.0, 40.0)
SCOREBOARD_EDITOR_LOCATION = unreal.Vector(-2400.0, 0.0, 280.0)
SCOREBOARD_RELATIVE_LOCATION = unreal.Vector(250.0, 0.0, -55.0)
SCOREBOARD_RELATIVE_ROTATION = unreal.Rotator(0.0, 180.0, 0.0)
WEST_GOAL_TRIGGER_LOCATION = unreal.Vector(-5370.0, 0.0, 120.0)
WEST_GOAL_TRIGGER_SCALE = unreal.Vector(0.9, 3.4, 1.6)
MATCH_DURATION_SECONDS = 180.0

UPDATE_FUNCTION = "UpdateScoreboardText"
RESET_FUNCTION = "ResetMatchState"
REGISTER_HOME_GOAL_FUNCTION = "RegisterHomeGoal"
REGISTER_AWAY_GOAL_FUNCTION = "RegisterAwayGoal"
END_MATCH_FUNCTION = "EndMatch"

INT_PIN_TYPE_TEXT = (
    '(PinCategory="int",PinSubCategory="",PinSubCategoryObject=None,'
    'PinSubCategoryMemberReference=(MemberParent=None,MemberName="",MemberGuid=00000000000000000000000000000000),'
    'PinValueType=(TerminalCategory="",TerminalSubCategory="",TerminalSubCategoryObject=None,'
    'bTerminalIsConst=False,bTerminalIsWeakPointer=False,bTerminalIsUObjectWrapper=False),'
    'ContainerType=None,bIsReference=False,bIsConst=False,bIsWeakPointer=False,'
    'bIsUObjectWrapper=False,bSerializeAsSinglePrecisionFloat=False)'
)
FLOAT_PIN_TYPE_TEXT = (
    '(PinCategory="real",PinSubCategory="float",PinSubCategoryObject=None,'
    'PinSubCategoryMemberReference=(MemberParent=None,MemberName="",MemberGuid=00000000000000000000000000000000),'
    'PinValueType=(TerminalCategory="",TerminalSubCategory="",TerminalSubCategoryObject=None,'
    'bTerminalIsConst=False,bTerminalIsWeakPointer=False,bTerminalIsUObjectWrapper=False),'
    'ContainerType=None,bIsReference=False,bIsConst=False,bIsWeakPointer=False,'
    'bIsUObjectWrapper=False,bSerializeAsSinglePrecisionFloat=False)'
)
BOOL_PIN_TYPE_TEXT = (
    '(PinCategory="bool",PinSubCategory="",PinSubCategoryObject=None,'
    'PinSubCategoryMemberReference=(MemberParent=None,MemberName="",MemberGuid=00000000000000000000000000000000),'
    'PinValueType=(TerminalCategory="",TerminalSubCategory="",TerminalSubCategoryObject=None,'
    'bTerminalIsConst=False,bTerminalIsWeakPointer=False,bTerminalIsUObjectWrapper=False),'
    'ContainerType=None,bIsReference=False,bIsConst=False,bIsWeakPointer=False,'
    'bIsUObjectWrapper=False,bSerializeAsSinglePrecisionFloat=False)'
)


def log(message):
    unreal.log(f"[OBITREND Scoreboard] {message}")


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


def make_pin_type(pin_type_text):
    pin_type = unreal.EdGraphPinType()
    pin_type.import_text(pin_type_text)
    return pin_type


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


def get_or_create_function_editor(blueprint, func_name):
    editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, func_name)
    if editor is not None:
        return editor
    return unreal.BlueprintGraphEditor.create_and_edit_function_graph(blueprint, func_name)


def clear_graph_except_entry(graph_editor, entry_title):
    entry_node = None
    removable_nodes = []
    for node in graph_editor.list_all_nodes():
        if node.get_node_title() == entry_title:
            entry_node = node
        else:
            removable_nodes.append(node)

    if entry_node is None:
        raise RuntimeError(f"Graph entry node '{entry_title}' not found")

    if removable_nodes:
        graph_editor.remove_nodes(removable_nodes)

    return entry_node


def clear_event_graph(blueprint):
    event_editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, "EventGraph")
    if event_editor is None:
        raise RuntimeError("Blueprint EventGraph is missing")
    nodes = event_editor.list_all_nodes()
    if nodes:
        event_editor.remove_nodes(nodes)
    return event_editor


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


def create_scoreboard_blueprint():
    blueprint = get_or_create_blueprint(SCOREBOARD_BP_NAME, unreal.TextRenderActor)
    ensure_member_variable(blueprint, "HomeScore", INT_PIN_TYPE_TEXT)
    ensure_member_variable(blueprint, "AwayScore", INT_PIN_TYPE_TEXT)
    ensure_member_variable(blueprint, "MatchStartTime", FLOAT_PIN_TYPE_TEXT)
    ensure_member_variable(blueprint, "MatchDurationSeconds", FLOAT_PIN_TYPE_TEXT)
    ensure_member_variable(blueprint, "MatchEnded", BOOL_PIN_TYPE_TEXT)

    build_update_scoreboard_function(blueprint)
    build_reset_match_function(blueprint)
    build_register_home_goal_function(blueprint)
    build_register_away_goal_function(blueprint)
    build_end_match_function(blueprint)
    build_scoreboard_event_graph(blueprint)

    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Scoreboard blueprint failed to compile")

    configure_scoreboard_defaults(blueprint)
    if not unreal.BlueprintEditorLibrary.compile_blueprint(blueprint):
        raise RuntimeError("Scoreboard blueprint failed to compile after default setup")

    return blueprint


def configure_scoreboard_defaults(blueprint):
    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class is None:
        raise RuntimeError("Scoreboard generated class is unavailable")

    cdo = unreal.get_default_object(generated_class)
    text_render = None
    try:
        text_render = cdo.get_editor_property("text_render")
    except Exception:
        text_render = None

    if text_render is None:
        try:
            text_render = cdo.get_text_render()
        except Exception:
            text_render = None

    if text_render is None:
        raise RuntimeError("Scoreboard TextRender component is unavailable")

    try:
        text_render.set_text("HOME 0 - 0 AWAY\n00:00")
    except Exception:
        pass
    try:
        text_render.set_horizontal_alignment(unreal.HorizTextAligment.EHTA_Center)
    except Exception:
        pass
    try:
        text_render.set_world_size(26.0)
    except Exception:
        pass
    try:
        text_render.set_x_scale(-1.35)
        text_render.set_y_scale(1.35)
    except Exception:
        pass
    try:
        text_render.set_editor_property("relative_rotation", unreal.Rotator(0.0, 180.0, 0.0))
    except Exception:
        pass
    try:
        cdo.set_editor_property("MatchDurationSeconds", MATCH_DURATION_SECONDS)
        cdo.set_editor_property("MatchEnded", False)
    except Exception:
        pass


def build_update_scoreboard_function(blueprint):
    function_editor = get_or_create_function_editor(blueprint, UPDATE_FUNCTION)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {UPDATE_FUNCTION}")

    function_editor.set_function_is_public()
    entry_node = clear_graph_except_entry(function_editor, UPDATE_FUNCTION)

    get_text_render_component_node = function_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(-1490.0, 40.0),
        [],
    )
    cast_text_render_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToTextRenderComponent",
        unreal.Vector2D(-1200.0, 40.0),
        [],
    )
    get_game_time_node = function_editor.create_node_from_name(
        "Utilities|Time|GetGameTimeinSeconds",
        unreal.Vector2D(-1480.0, -310.0),
        [],
    )
    get_match_start_node = function_editor.add_get_member_variable_node("MatchStartTime")
    get_match_start_node.set_node_pos(unreal.IntPoint(-1220, -260))
    elapsed_seconds_node = function_editor.create_node_from_name(
        "Utilities|Operators|Subtract",
        unreal.Vector2D(-990.0, -310.0),
        [get_pin(get_game_time_node, "return", "result")],
    )
    time_string_node = function_editor.create_node_from_name(
        "Utilities|String|TimeSecondstoString",
        unreal.Vector2D(-720.0, -320.0),
        [],
    )

    get_home_score_node = function_editor.add_get_member_variable_node("HomeScore")
    get_home_score_node.set_node_pos(unreal.IntPoint(-1230, -40))
    home_to_string_node = function_editor.create_node_from_name(
        "Utilities|String|ToString(Integer)",
        unreal.Vector2D(-980.0, -70.0),
        [],
    )
    get_away_score_node = function_editor.add_get_member_variable_node("AwayScore")
    get_away_score_node.set_node_pos(unreal.IntPoint(-1230, 150))
    away_to_string_node = function_editor.create_node_from_name(
        "Utilities|String|ToString(Integer)",
        unreal.Vector2D(-980.0, 120.0),
        [],
    )

    append_home_prefix_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-730.0, -70.0),
        [],
    )
    append_dash_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-480.0, -70.0),
        [],
    )
    append_away_score_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-220.0, -70.0),
        [],
    )
    append_away_suffix_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(40.0, -70.0),
        [],
    )
    append_timer_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(320.0, -70.0),
        [],
    )
    to_text_node = function_editor.create_node_from_name(
        "Utilities|Text|ToText(String)",
        unreal.Vector2D(610.0, -60.0),
        [],
    )
    set_text_node = function_editor.create_node_from_name(
        "Rendering|Components|TextRender|SetText",
        unreal.Vector2D(900.0, -20.0),
        [],
    )

    connect(get_pin(entry_node, "then"), get_pin(cast_text_render_node, "execute", "exec"), "Function entry -> Cast text render")
    connect(get_pin(get_text_render_component_node, "return", "returnvalue"), get_pin(cast_text_render_node, "object"), "GetComponentByClass -> CastToTextRenderComponent")
    connect(get_pin(cast_text_render_node, "then"), get_pin(set_text_node, "execute", "exec"), "Cast text render -> SetText")
    connect(get_pin(cast_text_render_node, "astextrendercomponent", "astext"), get_pin(set_text_node, "self"), "CastToTextRenderComponent -> SetText self")
    connect(get_pin(get_game_time_node, "return", "result"), get_pin(elapsed_seconds_node, "a"), "GetGameTime -> elapsed A")
    connect(get_pin(get_match_start_node, "matchstarttime"), get_pin(elapsed_seconds_node, "b"), "MatchStartTime -> elapsed B")
    connect(get_pin(elapsed_seconds_node, "return", "result"), get_pin(time_string_node, "inseconds"), "Elapsed -> TimeSecondsToString")
    connect(get_pin(get_home_score_node, "homescore"), get_pin(home_to_string_node, "inint"), "HomeScore -> ToString")
    connect(get_pin(get_away_score_node, "awayscore"), get_pin(away_to_string_node, "inint"), "AwayScore -> ToString")

    connect(get_pin(home_to_string_node, "return", "result"), get_pin(append_home_prefix_node, "b"), "Home string -> append")
    connect(get_pin(append_home_prefix_node, "return", "result"), get_pin(append_dash_node, "a"), "Home prefix string -> append dash")
    connect(get_pin(away_to_string_node, "return", "result"), get_pin(append_away_score_node, "b"), "Away string -> append")
    connect(get_pin(append_dash_node, "return", "result"), get_pin(append_away_score_node, "a"), "Dash string -> append away")
    connect(get_pin(append_away_score_node, "return", "result"), get_pin(append_away_suffix_node, "a"), "Away score string -> append suffix")
    connect(get_pin(append_away_suffix_node, "return", "result"), get_pin(append_timer_node, "a"), "Away suffix string -> append timer")
    connect(get_pin(time_string_node, "return", "result"), get_pin(append_timer_node, "b"), "Timer string -> append timer")
    connect(get_pin(append_timer_node, "return", "result"), get_pin(to_text_node, "instring"), "Final string -> ToText")
    connect(get_pin(to_text_node, "return", "result"), get_pin(set_text_node, "value"), "ToText -> SetText value")

    set_pin(get_pin(get_text_render_component_node, "componentclass"), unreal.TextRenderComponent.static_class().get_path_name())
    set_pin(get_pin(append_home_prefix_node, "a"), "HOME ")
    set_pin(get_pin(append_dash_node, "b"), " - ")
    set_pin(get_pin(append_away_suffix_node, "b"), " AWAY\\n")


def build_reset_match_function(blueprint):
    function_editor = get_or_create_function_editor(blueprint, RESET_FUNCTION)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {RESET_FUNCTION}")

    function_editor.set_function_is_public()
    entry_node = clear_graph_except_entry(function_editor, RESET_FUNCTION)

    set_home_score_node = function_editor.add_set_member_variable_node("HomeScore")
    set_home_score_node.set_node_pos(unreal.IntPoint(-1010, -170))
    set_away_score_node = function_editor.add_set_member_variable_node("AwayScore")
    set_away_score_node.set_node_pos(unreal.IntPoint(-690, -170))
    set_match_ended_node = function_editor.add_set_member_variable_node("MatchEnded")
    set_match_ended_node.set_node_pos(unreal.IntPoint(-520, 70))
    set_match_duration_node = function_editor.add_set_member_variable_node("MatchDurationSeconds")
    set_match_duration_node.set_node_pos(unreal.IntPoint(-380, -220))
    get_game_time_node = function_editor.create_node_from_name(
        "Utilities|Time|GetGameTimeinSeconds",
        unreal.Vector2D(-780.0, 70.0),
        [],
    )
    set_match_start_node = function_editor.add_set_member_variable_node("MatchStartTime")
    set_match_start_node.set_node_pos(unreal.IntPoint(-360, -70))
    update_text_node = function_editor.create_node_from_name(
        f"CallFunction|{UPDATE_FUNCTION}",
        unreal.Vector2D(-40.0, -50.0),
        [],
    )

    connect(get_pin(entry_node, "then"), get_pin(set_home_score_node, "execute", "exec"), "Reset entry -> Set HomeScore")
    connect(get_pin(set_home_score_node, "then"), get_pin(set_away_score_node, "execute", "exec"), "Set HomeScore -> Set AwayScore")
    connect(get_pin(set_away_score_node, "then"), get_pin(set_match_ended_node, "execute", "exec"), "Set AwayScore -> Set MatchEnded")
    connect(get_pin(set_match_ended_node, "then"), get_pin(set_match_duration_node, "execute", "exec"), "Set MatchEnded -> Set MatchDurationSeconds")
    connect(get_pin(set_match_duration_node, "then"), get_pin(set_match_start_node, "execute", "exec"), "Set MatchDurationSeconds -> Set MatchStartTime")
    connect(get_pin(get_game_time_node, "return", "result"), get_pin(set_match_start_node, "matchstarttime"), "Game time -> MatchStartTime")
    connect(get_pin(set_match_start_node, "then"), get_pin(update_text_node, "execute", "exec"), "Set MatchStartTime -> UpdateScoreboardText")

    set_pin(get_pin(set_home_score_node, "homescore"), "0")
    set_pin(get_pin(set_away_score_node, "awayscore"), "0")
    set_pin(get_pin(set_match_ended_node, "matchended"), "false")
    set_pin(get_pin(set_match_duration_node, "matchdurationseconds"), str(MATCH_DURATION_SECONDS))


def build_goal_processing_function(blueprint, function_name, score_variable_name, goal_message):
    character_blueprint = load_required_asset(CHARACTER_BP_PATH)
    ball_blueprint = load_required_asset(BALL_BP_PATH)

    function_editor = get_or_create_function_editor(blueprint, function_name)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {function_name}")

    function_editor.set_function_is_public()
    entry_node = clear_graph_except_entry(function_editor, function_name)

    get_match_ended_node = function_editor.add_get_member_variable_node("MatchEnded")
    get_match_ended_node.set_node_pos(unreal.IntPoint(-1530, -260))
    match_live_branch = function_editor.add_branch_node()
    match_live_branch.set_node_pos(unreal.IntPoint(-1290, -170))

    get_score_node = function_editor.add_get_member_variable_node(score_variable_name)
    get_score_node.set_node_pos(unreal.IntPoint(-1260, 10))
    add_score_node = function_editor.create_node_from_name(
        "Utilities|Operators|Add",
        unreal.Vector2D(-980.0, -10.0),
        [get_pin(get_score_node, score_variable_name.lower())],
    )
    set_score_node = function_editor.add_set_member_variable_node(score_variable_name)
    set_score_node.set_node_pos(unreal.IntPoint(-660, -20))
    update_text_node = function_editor.create_node_from_name(
        f"CallFunction|{UPDATE_FUNCTION}",
        unreal.Vector2D(-340.0, -10.0),
        [],
    )
    print_node = function_editor.create_node_from_name(
        "Development|PrintString",
        unreal.Vector2D(-20.0, -40.0),
        [],
    )
    get_all_balls_node = function_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(250.0, -40.0),
        [],
    )
    ball_is_valid_index_node = function_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(510.0, -80.0),
        [get_pin(get_all_balls_node, "outactors")],
    )
    has_ball_branch = function_editor.add_branch_node()
    has_ball_branch.set_node_pos(unreal.IntPoint(740, 20))
    get_ball_node = function_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(510.0, 120.0),
        [],
    )
    get_ball_component_node = function_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(770.0, 120.0),
        [],
    )
    cast_mesh_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToStaticMeshComponent",
        unreal.Vector2D(1040.0, 120.0),
        [],
    )
    zero_velocity_node = function_editor.create_node_from_name(
        "Physics|SetAllPhysicsLinearVelocity",
        unreal.Vector2D(1310.0, 80.0),
        [],
    )
    disable_sim_node = function_editor.create_node_from_name(
        "Physics|SetSimulatePhysics",
        unreal.Vector2D(1600.0, 80.0),
        [],
    )
    reset_ball_location_node = function_editor.create_node_from_name(
        "Transformation|SetActorLocation",
        unreal.Vector2D(1890.0, 40.0),
        [],
    )
    enable_sim_node = function_editor.create_node_from_name(
        "Physics|SetSimulatePhysics",
        unreal.Vector2D(2180.0, 80.0),
        [],
    )
    wake_ball_node = function_editor.create_node_from_name(
        "Physics|WakeRigidBody",
        unreal.Vector2D(2460.0, 80.0),
        [],
    )
    get_all_players_node = function_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(2740.0, 60.0),
        [],
    )
    player_is_valid_index_node = function_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(3000.0, 20.0),
        [get_pin(get_all_players_node, "outactors")],
    )
    has_player_branch = function_editor.add_branch_node()
    has_player_branch.set_node_pos(unreal.IntPoint(3230, 90))
    get_player_node = function_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(3000.0, 220.0),
        [],
    )
    reset_player_location_node = function_editor.create_node_from_name(
        "Transformation|SetActorLocation",
        unreal.Vector2D(3490.0, 200.0),
        [],
    )

    connect(get_pin(entry_node, "then"), get_pin(match_live_branch, "execute", "exec"), f"{function_name} -> MatchEnded branch")
    connect(get_pin(get_match_ended_node, "matchended"), get_pin(match_live_branch, "condition"), "MatchEnded -> Branch")
    connect(get_pin(match_live_branch, "else"), get_pin(set_score_node, "execute", "exec"), "Match live -> Set score")
    connect(get_pin(get_score_node, score_variable_name.lower()), get_pin(add_score_node, "a"), f"{score_variable_name} -> Add")
    connect(get_pin(add_score_node, "return", "result"), get_pin(set_score_node, score_variable_name.lower()), "Add result -> Set score")
    connect(get_pin(set_score_node, "then"), get_pin(update_text_node, "execute", "exec"), "Set score -> UpdateScoreboardText")
    connect(get_pin(update_text_node, "then"), get_pin(print_node, "execute", "exec"), "UpdateScoreboardText -> PrintString")
    connect(get_pin(print_node, "then"), get_pin(get_all_balls_node, "execute", "exec"), "PrintString -> GetAllActorsOfClass balls")
    connect(get_pin(get_all_balls_node, "then"), get_pin(has_ball_branch, "execute", "exec"), "GetAllActorsOfClass balls -> Ball branch")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(ball_is_valid_index_node, "targetarray"), "OutActors -> Ball IsValidIndex")
    connect(get_pin(ball_is_valid_index_node, "return", "result"), get_pin(has_ball_branch, "condition"), "Ball IsValidIndex -> Branch")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(get_ball_node, "array", "targetarray"), "OutActors -> Get ball")
    connect(get_pin(has_ball_branch, "then"), get_pin(cast_mesh_node, "execute", "exec"), "Has ball -> CastToStaticMeshComponent")
    connect(get_pin(get_ball_node, "output", "item", "return"), get_pin(get_ball_component_node, "self"), "Ball actor -> GetComponentByClass")
    connect(get_pin(get_ball_component_node, "return", "returnvalue"), get_pin(cast_mesh_node, "object"), "Ball component -> CastToStaticMeshComponent")
    connect(get_pin(cast_mesh_node, "then"), get_pin(zero_velocity_node, "execute", "exec"), "Cast mesh -> SetAllPhysicsLinearVelocity")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(zero_velocity_node, "self"), "Ball mesh -> SetAllPhysicsLinearVelocity self")
    connect(get_pin(zero_velocity_node, "then"), get_pin(disable_sim_node, "execute", "exec"), "Zero velocity -> SetSimulatePhysics false")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(disable_sim_node, "self"), "Ball mesh -> SetSimulatePhysics false self")
    connect(get_pin(disable_sim_node, "then"), get_pin(reset_ball_location_node, "execute", "exec"), "Disable sim -> SetActorLocation")
    connect(get_pin(get_ball_node, "output", "item", "return"), get_pin(reset_ball_location_node, "self"), "Ball actor -> SetActorLocation self")
    connect(get_pin(reset_ball_location_node, "then"), get_pin(enable_sim_node, "execute", "exec"), "Reset ball -> SetSimulatePhysics true")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(enable_sim_node, "self"), "Ball mesh -> SetSimulatePhysics true self")
    connect(get_pin(enable_sim_node, "then"), get_pin(wake_ball_node, "execute", "exec"), "Enable sim -> WakeRigidBody")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(wake_ball_node, "self"), "Ball mesh -> WakeRigidBody self")
    connect(get_pin(wake_ball_node, "then"), get_pin(get_all_players_node, "execute", "exec"), "WakeRigidBody -> GetAllActorsOfClass players")
    connect(get_pin(get_all_players_node, "then"), get_pin(has_player_branch, "execute", "exec"), "GetAllActorsOfClass players -> Branch")
    connect(get_pin(get_all_players_node, "outactors"), get_pin(player_is_valid_index_node, "targetarray"), "OutActors -> Player IsValidIndex")
    connect(get_pin(player_is_valid_index_node, "return", "result"), get_pin(has_player_branch, "condition"), "Player IsValidIndex -> Branch")
    connect(get_pin(get_all_players_node, "outactors"), get_pin(get_player_node, "array", "targetarray"), "OutActors -> Get player")
    connect(get_pin(has_player_branch, "then"), get_pin(reset_player_location_node, "execute", "exec"), "Has player -> Reset player location")
    connect(get_pin(get_player_node, "output", "item", "return"), get_pin(reset_player_location_node, "self"), "Player actor -> SetActorLocation self")

    set_pin(get_pin(add_score_node, "b"), "1")
    set_pin(get_pin(print_node, "instring"), goal_message)
    set_pin(get_pin(print_node, "bprinttoscreen"), "true")
    set_pin(get_pin(print_node, "bprinttolog"), "true")
    set_pin(get_pin(print_node, "duration"), "2.0")
    set_pin(get_pin(get_all_balls_node, "actorclass"), ball_blueprint.generated_class().get_path_name())
    set_pin(get_pin(ball_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_ball_node, "index", "dimension1"), "0")
    set_pin(get_pin(get_ball_component_node, "componentclass"), unreal.StaticMeshComponent.static_class().get_path_name())
    set_pin(get_pin(zero_velocity_node, "newvel"), "(X=0.0,Y=0.0,Z=0.0)")
    set_pin(get_pin(zero_velocity_node, "baddtocurrent"), "false")
    set_pin(get_pin(disable_sim_node, "bsimulate"), "false")
    set_pin(
        get_pin(reset_ball_location_node, "newlocation"),
        f"(X={BALL_RESET_LOCATION.x},Y={BALL_RESET_LOCATION.y},Z={BALL_RESET_LOCATION.z})",
    )
    set_pin(get_pin(reset_ball_location_node, "bsweep"), "false")
    set_pin(get_pin(reset_ball_location_node, "bteleport"), "true")
    set_pin(get_pin(enable_sim_node, "bsimulate"), "true")
    set_pin(get_pin(get_all_players_node, "actorclass"), character_blueprint.generated_class().get_path_name())
    set_pin(get_pin(player_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_player_node, "index", "dimension1"), "0")
    set_pin(
        get_pin(reset_player_location_node, "newlocation"),
        f"(X={PLAYER_RESET_LOCATION.x},Y={PLAYER_RESET_LOCATION.y},Z={PLAYER_RESET_LOCATION.z})",
    )
    set_pin(get_pin(reset_player_location_node, "bsweep"), "false")
    set_pin(get_pin(reset_player_location_node, "bteleport"), "true")


def build_register_home_goal_function(blueprint):
    build_goal_processing_function(blueprint, REGISTER_HOME_GOAL_FUNCTION, "HomeScore", "GOAL! HOME")


def build_register_away_goal_function(blueprint):
    build_goal_processing_function(blueprint, REGISTER_AWAY_GOAL_FUNCTION, "AwayScore", "GOAL! AWAY")


def build_end_match_function(blueprint):
    ball_blueprint = load_required_asset(BALL_BP_PATH)

    function_editor = get_or_create_function_editor(blueprint, END_MATCH_FUNCTION)
    if function_editor is None:
        raise RuntimeError(f"Failed to access function graph: {END_MATCH_FUNCTION}")

    function_editor.set_function_is_public()
    entry_node = clear_graph_except_entry(function_editor, END_MATCH_FUNCTION)

    set_match_ended_node = function_editor.add_set_member_variable_node("MatchEnded")
    set_match_ended_node.set_node_pos(unreal.IntPoint(-1370, -180))
    get_text_render_component_node = function_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(-1110.0, 40.0),
        [],
    )
    cast_text_render_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToTextRenderComponent",
        unreal.Vector2D(-840.0, 40.0),
        [],
    )
    get_home_score_node = function_editor.add_get_member_variable_node("HomeScore")
    get_home_score_node.set_node_pos(unreal.IntPoint(-1110, -240))
    home_to_string_node = function_editor.create_node_from_name(
        "Utilities|String|ToString(Integer)",
        unreal.Vector2D(-840.0, -260.0),
        [],
    )
    get_away_score_node = function_editor.add_get_member_variable_node("AwayScore")
    get_away_score_node.set_node_pos(unreal.IntPoint(-1110, -80))
    away_to_string_node = function_editor.create_node_from_name(
        "Utilities|String|ToString(Integer)",
        unreal.Vector2D(-840.0, -100.0),
        [],
    )
    append_home_prefix_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-590.0, -260.0),
        [],
    )
    append_dash_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-350.0, -260.0),
        [],
    )
    append_away_score_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(-100.0, -260.0),
        [],
    )
    append_suffix_node = function_editor.create_node_from_name(
        "Utilities|String|Append",
        unreal.Vector2D(160.0, -260.0),
        [],
    )
    to_text_node = function_editor.create_node_from_name(
        "Utilities|Text|ToText(String)",
        unreal.Vector2D(430.0, -260.0),
        [],
    )
    set_text_node = function_editor.create_node_from_name(
        "Rendering|Components|TextRender|SetText",
        unreal.Vector2D(720.0, -220.0),
        [],
    )
    print_node = function_editor.create_node_from_name(
        "Development|PrintString",
        unreal.Vector2D(980.0, -220.0),
        [],
    )
    get_all_balls_node = function_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(1220.0, -180.0),
        [],
    )
    ball_is_valid_index_node = function_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(1480.0, -220.0),
        [get_pin(get_all_balls_node, "outactors")],
    )
    has_ball_branch = function_editor.add_branch_node()
    has_ball_branch.set_node_pos(unreal.IntPoint(1710, -120))
    get_ball_node = function_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(1480.0, -20.0),
        [],
    )
    get_ball_component_node = function_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(1740.0, -20.0),
        [],
    )
    cast_mesh_node = function_editor.create_node_from_name(
        "Utilities|Casting|CastToStaticMeshComponent",
        unreal.Vector2D(2010.0, -20.0),
        [],
    )
    zero_velocity_node = function_editor.create_node_from_name(
        "Physics|SetAllPhysicsLinearVelocity",
        unreal.Vector2D(2290.0, -60.0),
        [],
    )
    disable_sim_node = function_editor.create_node_from_name(
        "Physics|SetSimulatePhysics",
        unreal.Vector2D(2570.0, -60.0),
        [],
    )

    connect(get_pin(entry_node, "then"), get_pin(set_match_ended_node, "execute", "exec"), "EndMatch -> Set MatchEnded")
    connect(get_pin(set_match_ended_node, "then"), get_pin(cast_text_render_node, "execute", "exec"), "Set MatchEnded -> CastToTextRenderComponent")
    connect(get_pin(get_text_render_component_node, "return", "returnvalue"), get_pin(cast_text_render_node, "object"), "GetComponentByClass -> CastToTextRenderComponent")
    connect(get_pin(cast_text_render_node, "then"), get_pin(set_text_node, "execute", "exec"), "Cast text render -> SetText")
    connect(get_pin(cast_text_render_node, "astextrendercomponent", "astext"), get_pin(set_text_node, "self"), "CastToTextRenderComponent -> SetText self")
    connect(get_pin(get_home_score_node, "homescore"), get_pin(home_to_string_node, "inint"), "HomeScore -> ToString")
    connect(get_pin(get_away_score_node, "awayscore"), get_pin(away_to_string_node, "inint"), "AwayScore -> ToString")
    connect(get_pin(home_to_string_node, "return", "result"), get_pin(append_home_prefix_node, "b"), "Home score string -> Append")
    connect(get_pin(append_home_prefix_node, "return", "result"), get_pin(append_dash_node, "a"), "Home prefix string -> Append dash")
    connect(get_pin(away_to_string_node, "return", "result"), get_pin(append_away_score_node, "b"), "Away score string -> Append")
    connect(get_pin(append_dash_node, "return", "result"), get_pin(append_away_score_node, "a"), "Dash string -> Append away score")
    connect(get_pin(append_away_score_node, "return", "result"), get_pin(append_suffix_node, "a"), "Away score string -> Append suffix")
    connect(get_pin(append_suffix_node, "return", "result"), get_pin(to_text_node, "instring"), "Final string -> ToText")
    connect(get_pin(to_text_node, "return", "result"), get_pin(set_text_node, "value"), "ToText -> SetText value")
    connect(get_pin(set_text_node, "then"), get_pin(print_node, "execute", "exec"), "SetText -> PrintString")
    connect(get_pin(print_node, "then"), get_pin(get_all_balls_node, "execute", "exec"), "PrintString -> GetAllActorsOfClass balls")
    connect(get_pin(get_all_balls_node, "then"), get_pin(has_ball_branch, "execute", "exec"), "GetAllActorsOfClass balls -> Branch")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(ball_is_valid_index_node, "targetarray"), "OutActors -> Ball IsValidIndex")
    connect(get_pin(ball_is_valid_index_node, "return", "result"), get_pin(has_ball_branch, "condition"), "Ball IsValidIndex -> Branch")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(get_ball_node, "array", "targetarray"), "OutActors -> Get ball")
    connect(get_pin(has_ball_branch, "then"), get_pin(cast_mesh_node, "execute", "exec"), "Has ball -> Cast mesh")
    connect(get_pin(get_ball_node, "output", "item", "return"), get_pin(get_ball_component_node, "self"), "Ball actor -> GetComponentByClass")
    connect(get_pin(get_ball_component_node, "return", "returnvalue"), get_pin(cast_mesh_node, "object"), "Ball component -> Cast mesh")
    connect(get_pin(cast_mesh_node, "then"), get_pin(zero_velocity_node, "execute", "exec"), "Cast mesh -> Zero velocity")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(zero_velocity_node, "self"), "Ball mesh -> Zero velocity self")
    connect(get_pin(zero_velocity_node, "then"), get_pin(disable_sim_node, "execute", "exec"), "Zero velocity -> Disable sim")
    connect(get_pin(cast_mesh_node, "asstaticmeshcomponent"), get_pin(disable_sim_node, "self"), "Ball mesh -> Disable sim self")

    set_pin(get_pin(set_match_ended_node, "matchended"), "true")
    set_pin(get_pin(get_text_render_component_node, "componentclass"), unreal.TextRenderComponent.static_class().get_path_name())
    set_pin(get_pin(append_home_prefix_node, "a"), "HOME ")
    set_pin(get_pin(append_dash_node, "b"), " - ")
    set_pin(get_pin(append_suffix_node, "b"), " AWAY\\nFULL TIME")
    set_pin(get_pin(print_node, "instring"), "FULL TIME")
    set_pin(get_pin(print_node, "bprinttoscreen"), "true")
    set_pin(get_pin(print_node, "bprinttolog"), "true")
    set_pin(get_pin(print_node, "duration"), "3.0")
    set_pin(get_pin(get_all_balls_node, "actorclass"), ball_blueprint.generated_class().get_path_name())
    set_pin(get_pin(ball_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_ball_node, "index", "dimension1"), "0")
    set_pin(get_pin(get_ball_component_node, "componentclass"), unreal.StaticMeshComponent.static_class().get_path_name())
    set_pin(get_pin(zero_velocity_node, "newvel"), "(X=0.0,Y=0.0,Z=0.0)")
    set_pin(get_pin(zero_velocity_node, "baddtocurrent"), "false")
    set_pin(get_pin(disable_sim_node, "bsimulate"), "false")


def build_scoreboard_event_graph(blueprint):
    character_blueprint = load_required_asset(CHARACTER_BP_PATH)
    character_class = get_blueprint_generated_class(character_blueprint)
    if character_class is None:
        raise RuntimeError("Character generated class unavailable for scoreboard setup")

    event_editor = clear_event_graph(blueprint)

    begin_play_event = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveBeginPlay",
        unreal.IntPoint(-2080, -240),
    )
    tick_event = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "ReceiveTick",
        unreal.IntPoint(-2090, 250),
    )
    reset_event = unreal.BlueprintEditorLibrary.add_event_override(
        blueprint,
        "K2_OnReset",
        unreal.IntPoint(-2090, 610),
    )

    reset_begin_node = event_editor.create_node_from_name(
        f"CallFunction|{RESET_FUNCTION}",
        unreal.Vector2D(-1800.0, -240.0),
        [],
    )
    get_all_players_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-1540.0, -230.0),
        [],
    )
    player_is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-1280.0, -270.0),
        [get_pin(get_all_players_node, "outactors")],
    )
    has_player_branch = event_editor.add_branch_node()
    has_player_branch.set_node_pos(unreal.IntPoint(-1060, -170))
    get_player_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-1280.0, -20.0),
        [],
    )
    get_camera_component_node = event_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(-1030.0, -20.0),
        [],
    )
    cast_camera_node = event_editor.create_node_from_name(
        "Utilities|Casting|CastToCameraComponent",
        unreal.Vector2D(-760.0, -20.0),
        [],
    )
    attach_actor_node = event_editor.create_node_from_name(
        "Transformation|AttachActorToComponent",
        unreal.Vector2D(-460.0, -60.0),
        [],
    )
    set_relative_location_node = event_editor.create_node_from_name(
        "Transformation|SetActorRelativeLocation",
        unreal.Vector2D(-130.0, -100.0),
        [],
    )
    set_relative_rotation_node = event_editor.create_node_from_name(
        "Transformation|SetActorRelativeRotation",
        unreal.Vector2D(170.0, -110.0),
        [],
    )
    get_text_render_component_node = event_editor.create_node_from_name(
        "Actor|GetComponentbyClass",
        unreal.Vector2D(430.0, -110.0),
        [],
    )
    cast_text_render_node = event_editor.create_node_from_name(
        "Utilities|Casting|CastToTextRenderComponent",
        unreal.Vector2D(710.0, -110.0),
        [],
    )
    set_x_scale_node = event_editor.create_node_from_name(
        "Rendering|Components|TextRender|SetXScale",
        unreal.Vector2D(1010.0, -150.0),
        [],
    )
    set_y_scale_node = event_editor.create_node_from_name(
        "Rendering|Components|TextRender|SetYScale",
        unreal.Vector2D(1290.0, -80.0),
        [],
    )

    get_match_ended_node = event_editor.add_get_member_variable_node("MatchEnded")
    get_match_ended_node.set_node_pos(unreal.IntPoint(-1790, 160))
    match_live_branch = event_editor.add_branch_node()
    match_live_branch.set_node_pos(unreal.IntPoint(-1550, 250))
    get_game_time_node = event_editor.create_node_from_name(
        "Utilities|Time|GetGameTimeinSeconds",
        unreal.Vector2D(-1790.0, 470.0),
        [],
    )
    get_match_start_node = event_editor.add_get_member_variable_node("MatchStartTime")
    get_match_start_node.set_node_pos(unreal.IntPoint(-1540, 470))
    elapsed_seconds_node = event_editor.create_node_from_name(
        "Utilities|Operators|Subtract",
        unreal.Vector2D(-1290.0, 470.0),
        [get_pin(get_game_time_node, "return", "result")],
    )
    get_match_duration_node = event_editor.add_get_member_variable_node("MatchDurationSeconds")
    get_match_duration_node.set_node_pos(unreal.IntPoint(-1290, 640))
    time_remaining_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-1020.0, 470.0),
        [get_pin(elapsed_seconds_node, "return", "result")],
    )
    time_remaining_branch = event_editor.add_branch_node()
    time_remaining_branch.set_node_pos(unreal.IntPoint(-800, 520))
    update_tick_node = event_editor.create_node_from_name(
        f"CallFunction|{UPDATE_FUNCTION}",
        unreal.Vector2D(-520.0, 420.0),
        [],
    )
    end_match_node = event_editor.create_node_from_name(
        f"CallFunction|{END_MATCH_FUNCTION}",
        unreal.Vector2D(-520.0, 620.0),
        [],
    )
    reset_restart_node = event_editor.create_node_from_name(
        f"CallFunction|{RESET_FUNCTION}",
        unreal.Vector2D(-1790.0, 610.0),
        [],
    )

    connect(get_pin(begin_play_event, "then"), get_pin(reset_begin_node, "execute", "exec"), "BeginPlay -> ResetMatchState")
    connect(get_pin(reset_begin_node, "then"), get_pin(get_all_players_node, "execute", "exec"), "ResetMatchState -> GetAllActorsOfClass players")
    connect(get_pin(get_all_players_node, "then"), get_pin(has_player_branch, "execute", "exec"), "GetAllActorsOfClass -> Branch")
    connect(get_pin(get_all_players_node, "outactors"), get_pin(player_is_valid_index_node, "targetarray"), "OutActors -> IsValidIndex")
    connect(get_pin(player_is_valid_index_node, "return", "result"), get_pin(has_player_branch, "condition"), "IsValidIndex -> Branch")
    connect(get_pin(get_all_players_node, "outactors"), get_pin(get_player_node, "array", "targetarray"), "OutActors -> Get player")
    connect(get_pin(has_player_branch, "then"), get_pin(cast_camera_node, "execute", "exec"), "Has player -> Cast camera")
    connect(get_pin(get_player_node, "output", "item", "return"), get_pin(get_camera_component_node, "self"), "Player -> GetComponentByClass")
    connect(get_pin(get_camera_component_node, "return", "returnvalue"), get_pin(cast_camera_node, "object"), "Camera component -> Cast")
    connect(get_pin(cast_camera_node, "then"), get_pin(attach_actor_node, "execute", "exec"), "Cast camera -> Attach actor")
    connect(get_pin(cast_camera_node, "ascameracomponent", "ascamera"), get_pin(attach_actor_node, "parent"), "Camera component -> Attach parent")
    connect(get_pin(attach_actor_node, "then"), get_pin(set_relative_location_node, "execute", "exec"), "Attach -> SetActorRelativeLocation")
    connect(get_pin(set_relative_location_node, "then"), get_pin(set_relative_rotation_node, "execute", "exec"), "SetActorRelativeLocation -> SetActorRelativeRotation")
    connect(get_pin(set_relative_rotation_node, "then"), get_pin(cast_text_render_node, "execute", "exec"), "SetActorRelativeRotation -> CastToTextRenderComponent")
    connect(get_pin(get_text_render_component_node, "return", "returnvalue"), get_pin(cast_text_render_node, "object"), "GetComponentByClass -> CastToTextRenderComponent")
    connect(get_pin(cast_text_render_node, "then"), get_pin(set_x_scale_node, "execute", "exec"), "CastToTextRenderComponent -> SetXScale")
    connect(get_pin(cast_text_render_node, "astextrendercomponent", "astext"), get_pin(set_x_scale_node, "self"), "TextRenderComponent -> SetXScale self")
    connect(get_pin(set_x_scale_node, "then"), get_pin(set_y_scale_node, "execute", "exec"), "SetXScale -> SetYScale")
    connect(get_pin(cast_text_render_node, "astextrendercomponent", "astext"), get_pin(set_y_scale_node, "self"), "TextRenderComponent -> SetYScale self")

    connect(get_pin(tick_event, "then"), get_pin(match_live_branch, "execute", "exec"), "Tick -> MatchEnded branch")
    connect(get_pin(get_match_ended_node, "matchended"), get_pin(match_live_branch, "condition"), "MatchEnded -> branch")
    connect(get_pin(match_live_branch, "else"), get_pin(time_remaining_branch, "execute", "exec"), "Match live -> time remaining branch")
    connect(get_pin(get_game_time_node, "return", "result"), get_pin(elapsed_seconds_node, "a"), "Game time -> elapsed A")
    connect(get_pin(get_match_start_node, "matchstarttime"), get_pin(elapsed_seconds_node, "b"), "MatchStartTime -> elapsed B")
    connect(get_pin(elapsed_seconds_node, "return", "result"), get_pin(time_remaining_check_node, "a"), "Elapsed -> duration check A")
    connect(get_pin(get_match_duration_node, "matchdurationseconds"), get_pin(time_remaining_check_node, "b"), "MatchDurationSeconds -> duration check B")
    connect(get_pin(time_remaining_check_node, "return", "result"), get_pin(time_remaining_branch, "condition"), "Duration check -> branch")
    connect(get_pin(time_remaining_branch, "then"), get_pin(update_tick_node, "execute", "exec"), "Time remaining -> UpdateScoreboardText")
    connect(get_pin(time_remaining_branch, "else"), get_pin(end_match_node, "execute", "exec"), "Match time expired -> EndMatch")
    connect(get_pin(reset_event, "then"), get_pin(reset_restart_node, "execute", "exec"), "OnReset -> ResetMatchState")

    set_pin(get_pin(get_all_players_node, "actorclass"), character_class.get_path_name())
    set_pin(get_pin(player_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_player_node, "index", "dimension1"), "0")
    set_pin(get_pin(get_camera_component_node, "componentclass"), unreal.CameraComponent.static_class().get_path_name())
    set_pin(get_pin(get_text_render_component_node, "componentclass"), unreal.TextRenderComponent.static_class().get_path_name())
    set_pin(get_pin(attach_actor_node, "locationrule"), "KeepRelative")
    set_pin(get_pin(attach_actor_node, "rotationrule"), "KeepRelative")
    set_pin(get_pin(attach_actor_node, "scalerule"), "KeepWorld")
    set_pin(get_pin(attach_actor_node, "bweldsimulatedbodies"), "false")
    set_pin(
        get_pin(set_relative_location_node, "newrelativelocation"),
        f"(X={SCOREBOARD_RELATIVE_LOCATION.x},Y={SCOREBOARD_RELATIVE_LOCATION.y},Z={SCOREBOARD_RELATIVE_LOCATION.z})",
    )
    set_pin(get_pin(set_relative_location_node, "bsweep"), "false")
    set_pin(get_pin(set_relative_location_node, "bteleport"), "true")
    set_pin(
        get_pin(set_relative_rotation_node, "newrelativerotation"),
        f"(Pitch={SCOREBOARD_RELATIVE_ROTATION.pitch},Yaw={SCOREBOARD_RELATIVE_ROTATION.yaw},Roll={SCOREBOARD_RELATIVE_ROTATION.roll})",
    )
    set_pin(get_pin(set_relative_rotation_node, "bsweep"), "false")
    set_pin(get_pin(set_relative_rotation_node, "bteleport"), "true")
    set_pin(get_pin(set_x_scale_node, "value"), "-1.35")
    set_pin(get_pin(set_y_scale_node, "value"), "1.35")


def rebuild_goal_trigger_with_scoreboard(goal_trigger_blueprint, scoreboard_blueprint, register_function_name, x_min, x_max, y_min, y_max):
    ball_blueprint = load_required_asset(BALL_BP_PATH)
    scoreboard_class = get_blueprint_generated_class(scoreboard_blueprint)
    if scoreboard_class is None:
        raise RuntimeError("Scoreboard generated class unavailable for goal trigger setup")

    event_editor = clear_event_graph(goal_trigger_blueprint)

    tick_event = unreal.BlueprintEditorLibrary.add_event_override(
        goal_trigger_blueprint,
        "ReceiveTick",
        unreal.IntPoint(-2120, -80),
    )
    if tick_event is None:
        raise RuntimeError("Failed to add ReceiveTick to goal trigger")

    get_all_balls_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(-1880.0, -80.0),
        [],
    )
    ball_is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(-1620.0, -120.0),
        [get_pin(get_all_balls_node, "outactors")],
    )
    has_ball_branch = event_editor.add_branch_node()
    has_ball_branch.set_node_pos(unreal.IntPoint(-1400, -20))

    get_ball_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(-1620.0, 140.0),
        [],
    )
    get_ball_location_node = event_editor.create_node_from_name(
        "Transformation|GetActorLocation",
        unreal.Vector2D(-1360.0, 140.0),
        [],
    )
    break_ball_location_node = event_editor.create_node_from_name(
        "Math|Vector|BreakVector",
        unreal.Vector2D(-1110.0, 140.0),
        [],
    )
    x_min_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(-860.0, 20.0),
        [get_pin(break_ball_location_node, "x")],
    )
    x_min_branch = event_editor.add_branch_node()
    x_min_branch.set_node_pos(unreal.IntPoint(-640, 10))
    x_max_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(-380.0, 20.0),
        [get_pin(break_ball_location_node, "x")],
    )
    x_max_branch = event_editor.add_branch_node()
    x_max_branch.set_node_pos(unreal.IntPoint(-160, 10))
    y_min_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Greater(>)",
        unreal.Vector2D(110.0, 20.0),
        [get_pin(break_ball_location_node, "y")],
    )
    y_min_branch = event_editor.add_branch_node()
    y_min_branch.set_node_pos(unreal.IntPoint(330, 10))
    y_max_check_node = event_editor.create_node_from_name(
        "Utilities|Operators|Less(<)",
        unreal.Vector2D(590.0, 20.0),
        [get_pin(break_ball_location_node, "y")],
    )
    y_max_branch = event_editor.add_branch_node()
    y_max_branch.set_node_pos(unreal.IntPoint(810, 10))

    get_all_scoreboards_node = event_editor.create_node_from_name(
        "Actor|GetAllActorsOfClass",
        unreal.Vector2D(1080.0, -220.0),
        [],
    )
    scoreboard_is_valid_index_node = event_editor.create_node_from_name(
        "Utilities|Array|IsValidIndex",
        unreal.Vector2D(1340.0, -260.0),
        [get_pin(get_all_scoreboards_node, "outactors")],
    )
    has_scoreboard_branch = event_editor.add_branch_node()
    has_scoreboard_branch.set_node_pos(unreal.IntPoint(1560, -160))
    get_scoreboard_node = event_editor.create_node_from_name(
        "Utilities|Array|Get(aref)",
        unreal.Vector2D(1340.0, -10.0),
        [],
    )
    cast_scoreboard_node = event_editor.create_node_from_name(
        f"Utilities|Casting|CastTo{SCOREBOARD_BP_NAME}",
        unreal.Vector2D(1590.0, -10.0),
        [],
        None,
    )
    register_goal_node = event_editor.create_node_from_name(
        f"CallFunction|{register_function_name}",
        unreal.Vector2D(1860.0, -10.0),
        [get_pin(cast_scoreboard_node, "asbpmatchscoreboard", "asbp")],
    )

    connect(get_pin(tick_event, "then"), get_pin(get_all_balls_node, "execute", "exec"), "Tick -> GetAllActorsOfClass balls")
    connect(get_pin(get_all_balls_node, "then"), get_pin(has_ball_branch, "execute", "exec"), "GetAllActorsOfClass -> HasBall branch")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(ball_is_valid_index_node, "targetarray"), "OutActors -> Ball IsValidIndex")
    connect(get_pin(ball_is_valid_index_node, "return", "result"), get_pin(has_ball_branch, "condition"), "IsValidIndex -> HasBall branch condition")
    connect(get_pin(get_all_balls_node, "outactors"), get_pin(get_ball_node, "array", "targetarray"), "OutActors -> Get ball array")
    connect(get_pin(get_ball_node, "output", "item", "return"), get_pin(get_ball_location_node, "self"), "Ball actor -> GetActorLocation")
    connect(get_pin(get_ball_location_node, "return", "result"), get_pin(break_ball_location_node, "invec"), "Ball location -> BreakVector")
    connect(get_pin(break_ball_location_node, "x"), get_pin(x_min_check_node, "a"), "Ball X -> X min check")
    connect(get_pin(x_min_check_node, "return", "result"), get_pin(x_min_branch, "condition"), "X min result -> branch")
    connect(get_pin(has_ball_branch, "then"), get_pin(x_min_branch, "execute", "exec"), "Has ball -> X min branch")
    connect(get_pin(break_ball_location_node, "x"), get_pin(x_max_check_node, "a"), "Ball X -> X max check")
    connect(get_pin(x_max_check_node, "return", "result"), get_pin(x_max_branch, "condition"), "X max result -> branch")
    connect(get_pin(x_min_branch, "then"), get_pin(x_max_branch, "execute", "exec"), "X min true -> X max branch")
    connect(get_pin(break_ball_location_node, "y"), get_pin(y_min_check_node, "a"), "Ball Y -> Y min check")
    connect(get_pin(y_min_check_node, "return", "result"), get_pin(y_min_branch, "condition"), "Y min result -> branch")
    connect(get_pin(x_max_branch, "then"), get_pin(y_min_branch, "execute", "exec"), "X max true -> Y min branch")
    connect(get_pin(break_ball_location_node, "y"), get_pin(y_max_check_node, "a"), "Ball Y -> Y max check")
    connect(get_pin(y_max_check_node, "return", "result"), get_pin(y_max_branch, "condition"), "Y max result -> branch")
    connect(get_pin(y_min_branch, "then"), get_pin(y_max_branch, "execute", "exec"), "Y min true -> Y max branch")

    connect(get_pin(y_max_branch, "then"), get_pin(get_all_scoreboards_node, "execute", "exec"), "Goal confirmed -> GetAllActorsOfClass scoreboard")
    connect(get_pin(get_all_scoreboards_node, "then"), get_pin(has_scoreboard_branch, "execute", "exec"), "GetAllActorsOfClass scoreboard -> Branch")
    connect(get_pin(get_all_scoreboards_node, "outactors"), get_pin(scoreboard_is_valid_index_node, "targetarray"), "Scoreboards -> IsValidIndex")
    connect(get_pin(scoreboard_is_valid_index_node, "return", "result"), get_pin(has_scoreboard_branch, "condition"), "Scoreboard valid -> Branch")
    connect(get_pin(get_all_scoreboards_node, "outactors"), get_pin(get_scoreboard_node, "array", "targetarray"), "Scoreboards -> Get scoreboard")
    connect(get_pin(get_scoreboard_node, "output", "item", "return"), get_pin(cast_scoreboard_node, "object"), "Scoreboard actor -> Cast")
    connect(get_pin(has_scoreboard_branch, "then"), get_pin(cast_scoreboard_node, "execute", "exec"), "Has scoreboard -> Cast scoreboard")
    connect(get_pin(cast_scoreboard_node, "then"), get_pin(register_goal_node, "execute", "exec"), "Cast scoreboard -> Register goal")

    set_pin(get_pin(get_all_balls_node, "actorclass"), ball_blueprint.generated_class().get_path_name())
    set_pin(get_pin(ball_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_ball_node, "index", "dimension1"), "0")
    set_pin(get_pin(x_min_check_node, "b"), str(x_min))
    set_pin(get_pin(x_max_check_node, "b"), str(x_max))
    set_pin(get_pin(y_min_check_node, "b"), str(y_min))
    set_pin(get_pin(y_max_check_node, "b"), str(y_max))

    set_pin(get_pin(get_all_scoreboards_node, "actorclass"), scoreboard_class.get_path_name())
    set_pin(get_pin(scoreboard_is_valid_index_node, "index"), "0")
    set_pin(get_pin(get_scoreboard_node, "index", "dimension1"), "0")

    if not unreal.BlueprintEditorLibrary.compile_blueprint(goal_trigger_blueprint):
        raise RuntimeError("Goal trigger blueprint failed to compile after scoreboard integration")


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


def place_scoreboard_actor(scoreboard_blueprint):
    scoreboard_class = get_blueprint_generated_class(scoreboard_blueprint)
    if scoreboard_class is None:
        raise RuntimeError("Scoreboard generated class unavailable for placement")

    return ensure_single_actor(
        SCOREBOARD_LABEL,
        scoreboard_class,
        SCOREBOARD_EDITOR_LOCATION,
        unreal.Rotator(0.0, 0.0, 0.0),
        None,
    )


def get_or_create_west_goal_trigger_blueprint():
    return get_or_create_blueprint(WEST_GOAL_TRIGGER_BP_NAME, unreal.TriggerBox)


def place_west_goal_trigger_actor(west_goal_trigger_blueprint):
    west_goal_trigger_class = get_blueprint_generated_class(west_goal_trigger_blueprint)
    if west_goal_trigger_class is None:
        raise RuntimeError("West goal trigger generated class unavailable for placement")

    return ensure_single_actor(
        WEST_GOAL_TRIGGER_LABEL,
        west_goal_trigger_class,
        WEST_GOAL_TRIGGER_LOCATION,
        unreal.Rotator(0.0, 0.0, 0.0),
        WEST_GOAL_TRIGGER_SCALE,
    )


def save_assets_and_map(assets):
    packages = []
    for asset in assets:
        if asset:
            packages.append(asset.get_outermost())

    if packages and not unreal.EditorLoadingAndSavingUtils.save_packages(packages, True):
        raise RuntimeError("Failed to save scoreboard assets")

    world = ensure_target_level_is_open()
    if not unreal.EditorLoadingAndSavingUtils.save_map(world, MAP_PATH):
        raise RuntimeError("Failed to save Lvl_ThirdPerson")


def get_runtime_scoreboard_actor(pie_world, scoreboard_class):
    actors = unreal.GameplayStatics.get_all_actors_of_class(pie_world, scoreboard_class)
    if len(actors) != 1:
        raise RuntimeError(f"Expected exactly one scoreboard actor in PIE, found {len(actors)}")
    return actors[0]


def get_runtime_ball_actor(pie_world):
    ball_actors = [
        actor
        for actor in unreal.GameplayStatics.get_all_actors_of_class(pie_world, unreal.StaticMeshActor)
        if actor.get_actor_label() == BALL_LABEL
    ]
    if len(ball_actors) != 1:
        raise RuntimeError(f"Expected exactly one football in PIE, found {len(ball_actors)}")
    return ball_actors[0]


def wait_for_pie_world(level_subsystem):
    for _ in range(120):
        pie_worlds = unreal.EditorLevelLibrary.get_pie_worlds(False)
        if pie_worlds:
            return pie_worlds[0]
        time.sleep(0.1)

    raise RuntimeError("Failed to acquire PIE world")


def stop_pie_if_running(level_subsystem):
    if not level_subsystem.is_in_play_in_editor():
        return

    level_subsystem.editor_request_end_play()
    for _ in range(120):
        if not level_subsystem.is_in_play_in_editor():
            return
        time.sleep(0.1)

    raise RuntimeError("Failed to stop PIE cleanly")


def run_pie_verification(scoreboard_blueprint):
    level_subsystem = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    stop_pie_if_running(level_subsystem)

    scoreboard_class = get_blueprint_generated_class(scoreboard_blueprint)
    if scoreboard_class is None:
        raise RuntimeError("Scoreboard generated class unavailable for PIE verification")

    level_subsystem.editor_request_begin_play()
    pie_world = wait_for_pie_world(level_subsystem)

    scoreboard_actor = get_runtime_scoreboard_actor(pie_world, scoreboard_class)
    ball_actor = get_runtime_ball_actor(pie_world)
    text_render = scoreboard_actor.get_component_by_class(unreal.TextRenderComponent)
    if text_render is None:
        raise RuntimeError("PIE scoreboard actor is missing a TextRenderComponent")

    initial_text = text_render.get_text()
    initial_score = int(scoreboard_actor.get_editor_property("HomeScore"))
    time.sleep(1.3)
    timer_text = text_render.get_text()

    ball_actor.set_actor_location(GOAL_TEST_LOCATION, False, False)
    time.sleep(0.6)

    after_goal_text = text_render.get_text()
    after_goal_score = int(scoreboard_actor.get_editor_property("HomeScore"))
    ball_location_after_goal = ball_actor.get_actor_location()

    screenshot_task = unreal.AutomationLibrary.take_high_res_screenshot(
        1280,
        720,
        "ScoreboardPIEValidation.png",
        None,
        False,
        False,
        unreal.ComparisonTolerance.LOW,
        "OBITREND scoreboard verification",
        0.2,
        True,
    )
    if screenshot_task is not None:
        for _ in range(60):
            if screenshot_task.is_task_done():
                break
            time.sleep(0.1)

    stop_pie_if_running(level_subsystem)

    level_subsystem.editor_request_begin_play()
    restart_world = wait_for_pie_world(level_subsystem)
    restarted_scoreboard = get_runtime_scoreboard_actor(restart_world, scoreboard_class)
    restarted_text = restarted_scoreboard.get_component_by_class(unreal.TextRenderComponent).get_text()
    restarted_score = int(restarted_scoreboard.get_editor_property("HomeScore"))

    stop_pie_if_running(level_subsystem)

    verification = {
        "initial_text": str(initial_text),
        "timer_text": str(timer_text),
        "after_goal_text": str(after_goal_text),
        "restarted_text": str(restarted_text),
        "initial_score": initial_score,
        "after_goal_score": after_goal_score,
        "restarted_score": restarted_score,
        "timer_advanced": str(initial_text) != str(timer_text),
        "goal_incremented_score": after_goal_score == 1,
        "ball_reset_after_goal": (
            abs(ball_location_after_goal.x - BALL_RESET_LOCATION.x) < 15.0
            and abs(ball_location_after_goal.y - BALL_RESET_LOCATION.y) < 15.0
        ),
        "restart_reset_score": restarted_score == 0,
        "restart_reset_text": "HOME 0 - 0 AWAY" in str(restarted_text),
        "screenshot_path": "Saved/Screenshots/WindowsEditor/ScoreboardPIEValidation.png",
    }

    if not verification["timer_advanced"]:
        raise RuntimeError("Scoreboard timer did not advance during PIE")
    if not verification["goal_incremented_score"]:
        raise RuntimeError("Scoreboard score did not increment after a valid goal")
    if not verification["ball_reset_after_goal"]:
        raise RuntimeError("Ball did not reset after goal verification")
    if not verification["restart_reset_score"]:
        raise RuntimeError("Scoreboard score did not reset after restarting PIE")

    log(json.dumps(verification))
    return verification


def verify_editor_state(scoreboard_blueprint):
    actors = unreal.EditorLevelLibrary.get_all_level_actors()
    scoreboards = [actor for actor in actors if actor.get_actor_label() == SCOREBOARD_LABEL]
    balls = [actor for actor in actors if actor.get_actor_label() == BALL_LABEL]

    dirty_content = [str(pkg.get_name()) for pkg in unreal.EditorLoadingAndSavingUtils.get_dirty_content_packages()]
    dirty_maps = [str(pkg.get_name()) for pkg in unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages()]
    event_graph = unreal.BlueprintGraphEditor.get_graph_editor_by_name(scoreboard_blueprint, "EventGraph")

    verification = {
        "scoreboard_count": len(scoreboards),
        "ball_count": len(balls),
        "event_graph_nodes": [node.get_node_title() for node in event_graph.list_all_nodes()],
        "dirty_content": dirty_content,
        "dirty_maps": dirty_maps,
    }
    log(json.dumps(verification))

    if len(scoreboards) != 1:
        raise RuntimeError(f"Expected exactly one scoreboard actor in editor, found {len(scoreboards)}")
    if len(balls) != 1:
        raise RuntimeError(f"Expected exactly one football in editor, found {len(balls)}")
    if dirty_content or dirty_maps:
        raise RuntimeError("Project is not in a clean saved state after scoreboard setup")

    return verification


def main():
    ensure_directory(SYSTEM_DIR)
    ensure_directory(BLUEPRINT_DIR)
    ensure_target_level_is_open()

    scoreboard_blueprint = create_scoreboard_blueprint()
    goal_trigger_blueprint = load_required_asset(GOAL_TRIGGER_BP_PATH)
    rebuild_goal_trigger_with_scoreboard(goal_trigger_blueprint, scoreboard_blueprint)
    place_scoreboard_actor(scoreboard_blueprint)
    save_assets_and_map([scoreboard_blueprint, goal_trigger_blueprint])
    run_pie_verification(scoreboard_blueprint)
    save_assets_and_map([scoreboard_blueprint, goal_trigger_blueprint])
    verify_editor_state(scoreboard_blueprint)
    log("Match scoreboard + timer setup completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Setup failed: {exc}")
        traceback.print_exc()
        raise
