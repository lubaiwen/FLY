import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
import json
from pathlib import Path

from data.amap_integration import (
    AmapAPI,
    GeoDataProcessor,
    RealWorldEnvironment,
    POI,
    Building3D,
    WeatherData,
)


@dataclass
class SpatialGrid3D:
    lat: float
    lon: float
    altitude: float
    grid_id: str
    features: np.ndarray
    demand_score: float
    obstacle_height: float = 0.0
    is_restricted: bool = False


@dataclass
class FlightCorridor:
    start: Tuple[float, float, float]
    end: Tuple[float, float, float]
    width: float
    min_altitude: float
    max_altitude: float
    safety_margin: float = 50.0


@dataclass
class UrbanEnvironment3D:
    bounds: Tuple[float, float, float, float]
    resolution: int
    terrain: np.ndarray
    buildings: List[Building3D]
    restricted_zones: List[Dict]
    flight_corridors: List[FlightCorridor]
    weather: WeatherData


class GeoDataParser:
    
    def __init__(self, amap_api: AmapAPI = None):
        self.amap = amap_api or AmapAPI()
        self.processor = GeoDataProcessor(self.amap)
    
    def parse_poi_to_nest_features(self, poi: POI) -> np.ndarray:
        features = np.zeros(32)
        
        features[0] = poi.location[0]
        features[1] = poi.location[1]
        
        type_encoding = {
            "商业": [1, 0, 0, 0, 0],
            "住宅": [0, 1, 0, 0, 0],
            "工业": [0, 0, 1, 0, 0],
            "应急": [0, 0, 0, 1, 0],
            "医院": [0, 0, 0, 0, 1],
        }
        
        for key, encoding in type_encoding.items():
            if key in poi.type:
                features[2:7] = encoding
                break
        
        features[7] = poi.distance / 10000
        
        features[8] = self.processor.calculate_demand_density(poi.location, 1000)
        
        spatial_features = self.processor.create_spatial_features(poi.location, 2000)
        features[9:25] = spatial_features[:16]
        
        return features
    
    def parse_building_to_3d_features(self, building: Building3D) -> np.ndarray:
        features = np.zeros(16)
        
        features[0] = building.location[0]
        features[1] = building.location[1]
        features[2] = building.height / 200
        
        footprint_area = self._calculate_footprint_area(building.footprint)
        features[3] = footprint_area / 10000
        
        features[4] = building.height * footprint_area / 1000000
        
        type_encoding = {
            "商业": [1, 0, 0, 0],
            "住宅": [0, 1, 0, 0],
            "工业": [0, 0, 1, 0],
            "办公": [0, 0, 0, 1],
        }
        
        for key, encoding in type_encoding.items():
            if key in building.type:
                features[5:9] = encoding
                break
        
        return features
    
    def _calculate_footprint_area(self, footprint: List[Tuple[float, float]]) -> float:
        if len(footprint) < 3:
            return 0.0
        
        n = len(footprint)
        area = 0.0
        
        for i in range(n):
            j = (i + 1) % n
            area += footprint[i][0] * footprint[j][1]
            area -= footprint[j][0] * footprint[i][1]
        
        return abs(area) / 2 * 111000 * 111000
    
    def create_3d_grid(
        self,
        bounds: Tuple[float, float, float, float],
        resolution: int = 50,
        altitude_levels: int = 10,
    ) -> List[SpatialGrid3D]:
        min_lat, min_lon, max_lat, max_lon = bounds
        
        lat_step = (max_lat - min_lat) / resolution
        lon_step = (max_lon - min_lon) / resolution
        alt_step = 300 / altitude_levels
        
        grids = []
        
        for i in range(resolution):
            for j in range(resolution):
                for k in range(altitude_levels):
                    lat = min_lat + (i + 0.5) * lat_step
                    lon = min_lon + (j + 0.5) * lon_step
                    alt = 50 + k * alt_step
                    
                    grid_id = f"GRID_{i:03d}_{j:03d}_{k:02d}"
                    
                    features = self.processor.create_spatial_features((lat, lon), 500)
                    
                    demand_score = self.processor.calculate_demand_density((lat, lon), 500)
                    
                    obstacle_height = self._estimate_obstacle_height(lat, lon)
                    
                    is_restricted = self._check_restricted_zone(lat, lon, alt)
                    
                    grid = SpatialGrid3D(
                        lat=lat,
                        lon=lon,
                        altitude=alt,
                        grid_id=grid_id,
                        features=features,
                        demand_score=demand_score,
                        obstacle_height=obstacle_height,
                        is_restricted=is_restricted,
                    )
                    grids.append(grid)
        
        return grids
    
    def _estimate_obstacle_height(self, lat: float, lon: float) -> float:
        return np.random.exponential(30)
    
    def _check_restricted_zone(self, lat: float, lon: float, alt: float) -> bool:
        restricted_areas = [
            ((31.85, 117.22), 2000, 150),
            ((31.80, 117.28), 1500, 200),
        ]
        
        for center, radius, max_alt in restricted_areas:
            dist = np.sqrt(
                (lat - center[0]) ** 2 + (lon - center[1]) ** 2
            ) * 111000
            
            if dist < radius and alt < max_alt:
                return True
        
        return False
    
    def create_flight_corridors(
        self,
        nests: List[Dict],
        min_altitude: float = 100,
        max_altitude: float = 300,
    ) -> List[FlightCorridor]:
        corridors = []
        
        for i, nest_a in enumerate(nests):
            for j, nest_b in enumerate(nests):
                if i >= j:
                    continue
                
                start = (nest_a["lat"], nest_a["lon"], min_altitude)
                end = (nest_b["lat"], nest_b["lon"], min_altitude)
                
                distance = np.sqrt(
                    (start[0] - end[0]) ** 2 + (start[1] - end[1]) ** 2
                ) * 111000
                
                if distance < 5000:
                    corridor = FlightCorridor(
                        start=start,
                        end=end,
                        width=100,
                        min_altitude=min_altitude,
                        max_altitude=max_altitude,
                        safety_margin=50,
                    )
                    corridors.append(corridor)
        
        return corridors


class UrbanEnvironmentBuilder:
    
    def __init__(self, city: str = "合肥", api_key: str = None):
        self.real_world_env = RealWorldEnvironment(city=city, api_key=api_key)
        self.parser = GeoDataParser(self.real_world_env.amap)
    
    def build_environment(
        self,
        num_nests: int = 50,
        grid_resolution: int = 30,
        altitude_levels: int = 5,
    ) -> UrbanEnvironment3D:
        print("正在构建三维城市环境...")
        
        center = self.real_world_env.city_center
        bounds = (
            center[0] - 0.1,
            center[1] - 0.1,
            center[0] + 0.1,
            center[1] + 0.1,
        )
        
        print("  - 生成机槽位置...")
        nests = self.real_world_env.generate_nest_locations(num_nests)
        
        print("  - 获取三维建筑数据...")
        env_data = self.real_world_env.get_3d_environment_data(bounds)
        buildings = env_data["buildings"]
        
        print("  - 创建空间网格...")
        grids = self.parser.create_3d_grid(bounds, grid_resolution, altitude_levels)
        
        print("  - 生成飞行走廊...")
        corridors = self.parser.create_flight_corridors(nests)
        
        print("  - 获取天气数据...")
        weather = self.real_world_env.amap.get_weather(self.real_world_env.city)
        
        restricted_zones = self._identify_restricted_zones(buildings, grids)
        
        terrain = env_data["terrain"]
        
        return UrbanEnvironment3D(
            bounds=bounds,
            resolution=grid_resolution,
            terrain=terrain,
            buildings=buildings,
            restricted_zones=restricted_zones,
            flight_corridors=corridors,
            weather=weather,
        )
    
    def _identify_restricted_zones(
        self,
        buildings: List[Building3D],
        grids: List[SpatialGrid3D],
    ) -> List[Dict]:
        restricted = []
        
        for building in buildings:
            if building.height > 100:
                zone = {
                    "center": building.location,
                    "radius": 100,
                    "max_altitude": building.height + 50,
                    "type": "building",
                    "name": building.name,
                }
                restricted.append(zone)
        
        for grid in grids:
            if grid.is_restricted:
                zone = {
                    "center": (grid.lat, grid.lon),
                    "radius": 200,
                    "max_altitude": grid.altitude,
                    "type": "airspace",
                    "name": f"限制空域_{grid.grid_id}",
                }
                restricted.append(zone)
        
        return restricted
    
    def export_for_training(
        self,
        environment: UrbanEnvironment3D,
        output_path: str,
    ) -> Dict:
        data = {
            "bounds": environment.bounds,
            "resolution": environment.resolution,
            "terrain": environment.terrain.tolist(),
            "buildings": [
                {
                    "id": b.id,
                    "name": b.name,
                    "location": b.location,
                    "height": b.height,
                    "type": b.type,
                }
                for b in environment.buildings
            ],
            "restricted_zones": environment.restricted_zones,
            "flight_corridors": [
                {
                    "start": c.start,
                    "end": c.end,
                    "width": c.width,
                    "min_altitude": c.min_altitude,
                    "max_altitude": c.max_altitude,
                }
                for c in environment.flight_corridors
            ],
            "weather": {
                "temperature": environment.weather.temperature if environment.weather else 0,
                "humidity": environment.weather.humidity if environment.weather else 0,
                "wind_speed": environment.weather.wind_speed if environment.weather else 0,
            } if environment.weather else {},
        }
        
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"环境数据已导出到 {output_path}")
        
        return data


class RealWorldTrainingAdapter:
    
    def __init__(self, environment: UrbanEnvironment3D):
        self.environment = environment
    
    def get_state_features(self, drone_position: Tuple[float, float, float]) -> np.ndarray:
        features = np.zeros(64)
        
        features[0:3] = drone_position
        
        min_dist = float("inf")
        nearest_nest_idx = 0
        for i, corridor in enumerate(self.environment.flight_corridors):
            dist = self._point_to_corridor_distance(drone_position, corridor)
            if dist < min_dist:
                min_dist = dist
                nearest_nest_idx = i
        
        features[3] = min_dist / 10000
        
        obstacle_height = 0
        for building in self.environment.buildings:
            dist = np.sqrt(
                (drone_position[0] - building.location[0]) ** 2 +
                (drone_position[1] - building.location[1]) ** 2
            ) * 111000
            
            if dist < 500:
                obstacle_height = max(obstacle_height, building.height)
        
        features[4] = obstacle_height / 200
        
        if self.environment.weather:
            features[5] = self.environment.weather.temperature / 40
            features[6] = self.environment.weather.humidity / 100
            features[7] = self.environment.weather.wind_speed / 10
        
        in_restricted = False
        for zone in self.environment.restricted_zones:
            dist = np.sqrt(
                (drone_position[0] - zone["center"][0]) ** 2 +
                (drone_position[1] - zone["center"][1]) ** 2
            ) * 111000
            
            if dist < zone["radius"] and drone_position[2] < zone["max_altitude"]:
                in_restricted = True
                break
        
        features[8] = 1.0 if in_restricted else 0.0
        
        return features
    
    def _point_to_corridor_distance(
        self,
        point: Tuple[float, float, float],
        corridor: FlightCorridor,
    ) -> float:
        lat_dist = (point[0] - corridor.start[0]) ** 2 + (point[1] - corridor.start[1]) ** 2
        return np.sqrt(lat_dist) * 111000
    
    def get_valid_actions(
        self,
        current_position: Tuple[float, float, float],
        energy: float,
        max_distance: float = 5000,
    ) -> List[Tuple[float, float, float]]:
        valid_positions = []
        
        for corridor in self.environment.flight_corridors:
            end_pos = corridor.end
            
            distance = np.sqrt(
                (current_position[0] - end_pos[0]) ** 2 +
                (current_position[1] - end_pos[1]) ** 2
            ) * 111000
            
            if distance < max_distance and energy > distance * 0.5:
                valid_positions.append(end_pos)
        
        return valid_positions
    
    def calculate_reward(
        self,
        current_position: Tuple[float, float, float],
        target_position: Tuple[float, float, float],
        energy_consumed: float,
    ) -> float:
        distance = np.sqrt(
            (current_position[0] - target_position[0]) ** 2 +
            (current_position[1] - target_position[1]) ** 2
        ) * 111000
        
        energy_efficiency = 1.0 - energy_consumed / 5000
        
        safety_penalty = 0.0
        for zone in self.environment.restricted_zones:
            dist = np.sqrt(
                (target_position[0] - zone["center"][0]) ** 2 +
                (target_position[1] - zone["center"][1]) ** 2
            ) * 111000
            
            if dist < zone["radius"]:
                safety_penalty = -1.0
        
        weather_penalty = 0.0
        if self.environment.weather:
            if "雨" in self.environment.weather.weather:
                weather_penalty = -0.2
            if self.environment.weather.wind_speed > 5:
                weather_penalty = -0.1
        
        reward = (
            0.4 * energy_efficiency +
            0.3 * (1.0 - distance / 10000) +
            0.3 * (1.0 + safety_penalty + weather_penalty)
        )
        
        return reward


def build_real_world_training_data(
    city: str = "合肥",
    num_nests: int = 30,
    output_path: str = "data/real_world_3d_environment.json",
):
    builder = UrbanEnvironmentBuilder(city=city)
    
    environment = builder.build_environment(
        num_nests=num_nests,
        grid_resolution=20,
        altitude_levels=5,
    )
    
    builder.export_for_training(environment, output_path)
    
    print(f"\n环境统计:")
    print(f"  - 机槽数量: {len([c for c in environment.flight_corridors])}")
    print(f"  - 建筑数量: {len(environment.buildings)}")
    print(f"  - 限制区域: {len(environment.restricted_zones)}")
    print(f"  - 飞行走廊: {len(environment.flight_corridors)}")
    
    return environment


if __name__ == "__main__":
    build_real_world_training_data()
