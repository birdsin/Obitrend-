import traceback
import unreal


MAP_PATH = "/Game/ThirdPerson/Lvl_ThirdPerson"

PITCH_MATERIAL_DIR = "/Game/Football/Pitch"
STADIUM_MATERIAL_DIR = "/Game/Football/Stadium"

SOURCE_MATERIAL_INSTANCE = "/Game/LevelPrototyping/Materials/MI_DefaultColorway.MI_DefaultColorway"

PITCH_MATERIAL_PATH = f"{PITCH_MATERIAL_DIR}/MI_FootballPitchBase"
LINE_MATERIAL_PATH = f"{PITCH_MATERIAL_DIR}/MI_FootballFieldLine"
STAND_MATERIAL_PATH = f"{STADIUM_MATERIAL_DIR}/MI_StadiumStand"

CUBE_MESH_PATH = "/Game/LevelPrototyping/Meshes/SM_Cube.SM_Cube"
FLOOR_MESH_PATH = "/Engine/MapTemplates/SM_Template_Map_Floor.SM_Template_Map_Floor"

PITCH_HALF_LENGTH = 5250.0
PITCH_HALF_WIDTH = 3400.0
LINE_WIDTH = 20.0
LINE_HEIGHT = 4.0

PENALTY_DEPTH = 1650.0
PENALTY_HALF_WIDTH = 2016.0
GOAL_BOX_DEPTH = 550.0
GOAL_BOX_HALF_WIDTH = 916.0

GOAL_HALF_WIDTH = 366.0
GOAL_HEIGHT = 244.0
GOAL_DEPTH = 220.0
GOAL_POST_THICKNESS = 12.0

PLAYER_START_LOCATION = unreal.Vector(-2800.0, 0.0, 120.0)
PLAYER_START_ROTATION = unreal.Rotator(0.0, 0.0, 0.0)


def log(message):
    unreal.log(f"[OBITREND Stadium] {message}")


def ensure_directory(path):
    if not unreal.EditorAssetLibrary.does_directory_exist(path):
        unreal.EditorAssetLibrary.make_directory(path)
        log(f"Created directory: {path}")


def load_asset(path):
    asset = unreal.load_asset(path)
    if asset is None:
        raise RuntimeError(f"Missing required asset: {path}")
    return asset


def ensure_material_instance(target_path, base_color, roughness=0.9, metallic=0.0):
    ensure_directory(target_path.rsplit("/", 1)[0])

    if not unreal.EditorAssetLibrary.does_asset_exist(target_path):
        duplicated = unreal.EditorAssetLibrary.duplicate_asset(SOURCE_MATERIAL_INSTANCE, target_path)
        if not duplicated:
            raise RuntimeError(f"Failed to create material instance: {target_path}")

    material = load_asset(target_path)
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
        material, "Base Color", base_color
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        material, "Roughness", roughness
    )
    unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
        material, "Metallic", metallic
    )
    unreal.EditorAssetLibrary.save_loaded_asset(material)
    return material


def get_all_level_actors():
    return unreal.EditorLevelLibrary.get_all_level_actors()


def find_actor_by_label(label):
    for actor in get_all_level_actors():
        if actor.get_actor_label() == label:
            return actor
    return None


def destroy_actor(actor):
    unreal.EditorLevelLibrary.destroy_actor(actor)


def delete_existing_stadium_actors():
    removed = 0
    for actor in list(get_all_level_actors()):
        label = actor.get_actor_label()
        if label.startswith("FB_"):
            destroy_actor(actor)
            removed += 1
    log(f"Removed {removed} existing stadium actors.")


def clear_test_area_meshes():
    removable_prefixes = ("SM_Cube", "SM_Ramp", "SM_QuarterCylinder", "SM_Cylinder")
    removed = 0

    for actor in list(get_all_level_actors()):
        label = actor.get_actor_label()
        if actor.get_class().get_name() != "StaticMeshActor":
            continue
        if label in ("Floor", "SM_SkySphere"):
            continue
        if label.startswith(removable_prefixes):
            destroy_actor(actor)
            removed += 1

    log(f"Removed {removed} prototype test-area mesh actors.")


def spawn_static_mesh_actor(label, location, scale, mesh, material, rotation=None, collision_profile="BlockAll"):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor,
        location,
        rotation or unreal.Rotator(0.0, 0.0, 0.0),
    )
    if actor is None:
        raise RuntimeError(f"Failed to spawn actor: {label}")

    actor.set_actor_label(label, mark_dirty=True)
    actor.set_actor_scale3d(scale)

    mesh_component = actor.get_editor_property("static_mesh_component")
    mesh_component.set_static_mesh(mesh)
    mesh_component.set_material(0, material)
    mesh_component.set_collision_profile_name(collision_profile)
    mesh_component.set_editor_property("mobility", unreal.ComponentMobility.STATIC)
    return actor


def spawn_box(label, location, size, material, rotation=None, collision_profile="BlockAll"):
    mesh = load_asset(CUBE_MESH_PATH)
    scale = unreal.Vector(size.x / 100.0, size.y / 100.0, size.z / 100.0)
    return spawn_static_mesh_actor(label, location, scale, mesh, material, rotation, collision_profile)


def spawn_line(label, location, size, material):
    return spawn_box(label, location, size, material, collision_profile="NoCollision")


def build_pitch(pitch_material):
    floor = find_actor_by_label("Floor")
    if floor is not None:
        destroy_actor(floor)

    floor_mesh = load_asset(FLOOR_MESH_PATH)
    floor = spawn_static_mesh_actor(
        "Floor",
        unreal.Vector(0.0, 0.0, 0.0),
        unreal.Vector(10.5, 6.8, 1.0),
        floor_mesh,
        pitch_material,
        collision_profile="BlockAll",
    )
    floor.set_actor_location(unreal.Vector(0.0, 0.0, 0.0), False, False)

    log("Configured Floor as the main football pitch.")


def build_field_markings(line_material):
    z = LINE_HEIGHT * 0.5

    # Touchlines and goal lines
    spawn_line(
        "FB_Touchline_North",
        unreal.Vector(0.0, PITCH_HALF_WIDTH, z),
        unreal.Vector(PITCH_HALF_LENGTH * 2.0, LINE_WIDTH, LINE_HEIGHT),
        line_material,
    )
    spawn_line(
        "FB_Touchline_South",
        unreal.Vector(0.0, -PITCH_HALF_WIDTH, z),
        unreal.Vector(PITCH_HALF_LENGTH * 2.0, LINE_WIDTH, LINE_HEIGHT),
        line_material,
    )
    spawn_line(
        "FB_GoalLine_East",
        unreal.Vector(PITCH_HALF_LENGTH, 0.0, z),
        unreal.Vector(LINE_WIDTH, PITCH_HALF_WIDTH * 2.0, LINE_HEIGHT),
        line_material,
    )
    spawn_line(
        "FB_GoalLine_West",
        unreal.Vector(-PITCH_HALF_LENGTH, 0.0, z),
        unreal.Vector(LINE_WIDTH, PITCH_HALF_WIDTH * 2.0, LINE_HEIGHT),
        line_material,
    )
    spawn_line(
        "FB_HalfwayLine",
        unreal.Vector(0.0, 0.0, z),
        unreal.Vector(LINE_WIDTH, PITCH_HALF_WIDTH * 2.0, LINE_HEIGHT),
        line_material,
    )
    spawn_line(
        "FB_CenterSpot",
        unreal.Vector(0.0, 0.0, z),
        unreal.Vector(25.0, 25.0, LINE_HEIGHT),
        line_material,
    )

    # Penalty and goal boxes
    def build_goal_area(prefix, direction):
        goal_sign = 1.0 if direction == "east" else -1.0
        goal_line_x = PITCH_HALF_LENGTH * goal_sign

        penalty_front_x = goal_line_x - (PENALTY_DEPTH * goal_sign)
        goal_box_front_x = goal_line_x - (GOAL_BOX_DEPTH * goal_sign)

        spawn_line(
            f"{prefix}_PenaltyFront",
            unreal.Vector(penalty_front_x, 0.0, z),
            unreal.Vector(LINE_WIDTH, PENALTY_HALF_WIDTH * 2.0, LINE_HEIGHT),
            line_material,
        )
        spawn_line(
            f"{prefix}_PenaltySideNorth",
            unreal.Vector((goal_line_x + penalty_front_x) * 0.5, PENALTY_HALF_WIDTH, z),
            unreal.Vector(abs(goal_line_x - penalty_front_x), LINE_WIDTH, LINE_HEIGHT),
            line_material,
        )
        spawn_line(
            f"{prefix}_PenaltySideSouth",
            unreal.Vector((goal_line_x + penalty_front_x) * 0.5, -PENALTY_HALF_WIDTH, z),
            unreal.Vector(abs(goal_line_x - penalty_front_x), LINE_WIDTH, LINE_HEIGHT),
            line_material,
        )

        spawn_line(
            f"{prefix}_GoalBoxFront",
            unreal.Vector(goal_box_front_x, 0.0, z),
            unreal.Vector(LINE_WIDTH, GOAL_BOX_HALF_WIDTH * 2.0, LINE_HEIGHT),
            line_material,
        )
        spawn_line(
            f"{prefix}_GoalBoxNorth",
            unreal.Vector((goal_line_x + goal_box_front_x) * 0.5, GOAL_BOX_HALF_WIDTH, z),
            unreal.Vector(abs(goal_line_x - goal_box_front_x), LINE_WIDTH, LINE_HEIGHT),
            line_material,
        )
        spawn_line(
            f"{prefix}_GoalBoxSouth",
            unreal.Vector((goal_line_x + goal_box_front_x) * 0.5, -GOAL_BOX_HALF_WIDTH, z),
            unreal.Vector(abs(goal_line_x - goal_box_front_x), LINE_WIDTH, LINE_HEIGHT),
            line_material,
        )

    build_goal_area("FB_East", "east")
    build_goal_area("FB_West", "west")
    log("Built football field markings.")


def build_goal(prefix, direction, material):
    sign = 1.0 if direction == "east" else -1.0
    front_x = (PITCH_HALF_LENGTH + GOAL_POST_THICKNESS * 0.5) * sign
    back_x = (PITCH_HALF_LENGTH + GOAL_DEPTH) * sign

    post_size = unreal.Vector(GOAL_POST_THICKNESS, GOAL_POST_THICKNESS, GOAL_HEIGHT)
    crossbar_size = unreal.Vector(GOAL_POST_THICKNESS, GOAL_HALF_WIDTH * 2.0 + GOAL_POST_THICKNESS, GOAL_POST_THICKNESS)
    sidebar_size = unreal.Vector(GOAL_DEPTH, GOAL_POST_THICKNESS, GOAL_POST_THICKNESS)
    backbar_size = unreal.Vector(GOAL_POST_THICKNESS, GOAL_HALF_WIDTH * 2.0 + GOAL_POST_THICKNESS, GOAL_POST_THICKNESS)

    spawn_box(
        f"{prefix}_FrontPostNorth",
        unreal.Vector(front_x, GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.5),
        post_size,
        material,
    )
    spawn_box(
        f"{prefix}_FrontPostSouth",
        unreal.Vector(front_x, -GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.5),
        post_size,
        material,
    )
    spawn_box(
        f"{prefix}_CrossbarFront",
        unreal.Vector(front_x, 0.0, GOAL_HEIGHT),
        crossbar_size,
        material,
    )
    spawn_box(
        f"{prefix}_BackPostNorth",
        unreal.Vector(back_x, GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.5),
        post_size,
        material,
    )
    spawn_box(
        f"{prefix}_BackPostSouth",
        unreal.Vector(back_x, -GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.5),
        post_size,
        material,
    )
    spawn_box(
        f"{prefix}_CrossbarBack",
        unreal.Vector(back_x, 0.0, GOAL_HEIGHT),
        backbar_size,
        material,
    )
    spawn_box(
        f"{prefix}_SidebarNorth",
        unreal.Vector((front_x + back_x) * 0.5, GOAL_HALF_WIDTH, GOAL_HEIGHT),
        sidebar_size,
        material,
    )
    spawn_box(
        f"{prefix}_SidebarSouth",
        unreal.Vector((front_x + back_x) * 0.5, -GOAL_HALF_WIDTH, GOAL_HEIGHT),
        sidebar_size,
        material,
    )


def build_goals(goal_material):
    build_goal("FB_GoalEast", "east", goal_material)
    build_goal("FB_GoalWest", "west", goal_material)
    log("Built both goals.")


def build_stadium_bounds_and_stands(stand_material):
    wall_height = 220.0
    wall_thickness = 50.0
    wall_z = wall_height * 0.5

    # Boundary walls
    spawn_box(
        "FB_WallNorth",
        unreal.Vector(0.0, PITCH_HALF_WIDTH + 300.0, wall_z),
        unreal.Vector(11300.0, wall_thickness, wall_height),
        stand_material,
    )
    spawn_box(
        "FB_WallSouth",
        unreal.Vector(0.0, -(PITCH_HALF_WIDTH + 300.0), wall_z),
        unreal.Vector(11300.0, wall_thickness, wall_height),
        stand_material,
    )
    spawn_box(
        "FB_WallEast",
        unreal.Vector(PITCH_HALF_LENGTH + 450.0, 0.0, wall_z),
        unreal.Vector(wall_thickness, 7900.0, wall_height),
        stand_material,
    )
    spawn_box(
        "FB_WallWest",
        unreal.Vector(-(PITCH_HALF_LENGTH + 450.0), 0.0, wall_z),
        unreal.Vector(wall_thickness, 7900.0, wall_height),
        stand_material,
    )

    # Long-side stands
    spawn_box(
        "FB_StandNorthLower",
        unreal.Vector(0.0, PITCH_HALF_WIDTH + 1050.0, 200.0),
        unreal.Vector(11800.0, 1300.0, 400.0),
        stand_material,
    )
    spawn_box(
        "FB_StandNorthUpper",
        unreal.Vector(0.0, PITCH_HALF_WIDTH + 2050.0, 550.0),
        unreal.Vector(11800.0, 900.0, 700.0),
        stand_material,
    )
    spawn_box(
        "FB_StandSouthLower",
        unreal.Vector(0.0, -(PITCH_HALF_WIDTH + 1050.0), 200.0),
        unreal.Vector(11800.0, 1300.0, 400.0),
        stand_material,
    )
    spawn_box(
        "FB_StandSouthUpper",
        unreal.Vector(0.0, -(PITCH_HALF_WIDTH + 2050.0), 550.0),
        unreal.Vector(11800.0, 900.0, 700.0),
        stand_material,
    )

    # End stands
    spawn_box(
        "FB_StandEastLower",
        unreal.Vector(PITCH_HALF_LENGTH + 1300.0, 0.0, 200.0),
        unreal.Vector(1500.0, 8300.0, 400.0),
        stand_material,
    )
    spawn_box(
        "FB_StandEastUpper",
        unreal.Vector(PITCH_HALF_LENGTH + 2350.0, 0.0, 550.0),
        unreal.Vector(600.0, 8300.0, 700.0),
        stand_material,
    )
    spawn_box(
        "FB_StandWestLower",
        unreal.Vector(-(PITCH_HALF_LENGTH + 1300.0), 0.0, 200.0),
        unreal.Vector(1500.0, 8300.0, 400.0),
        stand_material,
    )
    spawn_box(
        "FB_StandWestUpper",
        unreal.Vector(-(PITCH_HALF_LENGTH + 2350.0), 0.0, 550.0),
        unreal.Vector(600.0, 8300.0, 700.0),
        stand_material,
    )

    log("Built stadium walls and stands.")


def place_player_start():
    existing = find_actor_by_label("PlayerStart")
    if existing is not None:
        destroy_actor(existing)

    player_start = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.PlayerStart,
        PLAYER_START_LOCATION,
        PLAYER_START_ROTATION,
    )
    if player_start is None:
        raise RuntimeError("Failed to spawn replacement PlayerStart")

    player_start.set_actor_label("PlayerStart", mark_dirty=True)
    log(f"Moved PlayerStart to {PLAYER_START_LOCATION}.")


def save_everything():
    unreal.EditorAssetLibrary.save_directory(PITCH_MATERIAL_DIR, only_if_is_dirty=False, recursive=True)
    unreal.EditorAssetLibrary.save_directory(STADIUM_MATERIAL_DIR, only_if_is_dirty=False, recursive=True)
    if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True):
        raise RuntimeError("Failed to save dirty level packages")
    log("Saved stadium changes.")


def main():
    if unreal.EditorLoadingAndSavingUtils.load_map(MAP_PATH) is None:
        raise RuntimeError(f"Failed to load map: {MAP_PATH}")

    pitch_material = ensure_material_instance(
        PITCH_MATERIAL_PATH,
        unreal.LinearColor(0.070, 0.340, 0.110, 1.0),
        roughness=0.95,
        metallic=0.0,
    )
    line_material = ensure_material_instance(
        LINE_MATERIAL_PATH,
        unreal.LinearColor(0.960, 0.960, 0.960, 1.0),
        roughness=0.55,
        metallic=0.0,
    )
    stand_material = ensure_material_instance(
        STAND_MATERIAL_PATH,
        unreal.LinearColor(0.160, 0.170, 0.190, 1.0),
        roughness=0.88,
        metallic=0.0,
    )

    delete_existing_stadium_actors()
    clear_test_area_meshes()
    build_pitch(pitch_material)
    build_field_markings(line_material)
    build_goals(line_material)
    build_stadium_bounds_and_stands(stand_material)
    place_player_start()
    save_everything()
    log("Basic football stadium build completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"Build failed: {exc}")
        traceback.print_exc()
        raise
