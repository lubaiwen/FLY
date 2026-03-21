import random
import math
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import numpy as np

from config import settings, RegionType
from models import Position, Nest, NestStatus


@dataclass
class GridCell:
    lat: float
    lon: float
    region_type: str
    demand_density: float
    nest_count: int = 0


class CityEnvironment:
    
    def __init__(
        self,
        center_lat: float = None,
        center_lon: float = None,
        grid_size: float = None,
        num_nests: int = None,
        region_distribution: Dict[str, float] = None,
    ):
        self.center_lat = center_lat or settings.city.center_lat
        self.center_lon = center_lon or settings.city.center_lon
        self.grid_size = grid_size or settings.city.grid_size
        self.num_nests = num_nests or settings.city.num_nests
        self.region_distribution = region_distribution or settings.city.region_distribution
        
        self.grid_cells: List[GridCell] = []
        self.nests: List[Nest] = []
        
        self._region_demand_weights = {
            RegionType.COMMERCIAL.value: 0.8,
            RegionType.RESIDENTIAL.value: 0.5,
            RegionType.INDUSTRIAL.value: 0.3,
            RegionType.EMERGENCY.value: 0.9,
        }
        
        self._region_names = {
            RegionType.COMMERCIAL.value: ["商业中心", "购物中心", "商务区", "金融街"],
            RegionType.RESIDENTIAL.value: ["住宅区", "居民小区", "社区", "生活区"],
            RegionType.INDUSTRIAL.value: ["工业园区", "科技园", "产业园", "物流园"],
            RegionType.EMERGENCY.value: ["应急中心", "救援站", "医疗中心", "消防站"],
        }
    
    def generate_grid(self, grid_rows: int = 20, grid_cols: int = 20) -> List[GridCell]:
        self.grid_cells = []
        
        half_rows = grid_rows // 2
        half_cols = grid_cols // 2
        
        for i in range(grid_rows):
            for j in range(grid_cols):
                lat = self.center_lat + (i - half_rows) * self.grid_size
                lon = self.center_lon + (j - half_cols) * self.grid_size
                
                region_type = self._assign_region_type()
                demand_density = self._calculate_demand_density(region_type, lat, lon)
                
                cell = GridCell(
                    lat=lat,
                    lon=lon,
                    region_type=region_type,
                    demand_density=demand_density,
                )
                self.grid_cells.append(cell)
        
        return self.grid_cells
    
    def _assign_region_type(self) -> str:
        rand = random.random()
        cumulative = 0.0
        
        for region_type, proportion in self.region_distribution.items():
            cumulative += proportion
            if rand <= cumulative:
                return region_type
        
        return RegionType.RESIDENTIAL.value
    
    def _calculate_demand_density(self, region_type: str, lat: float, lon: float) -> float:
        base_density = self._region_demand_weights.get(region_type, 0.5)
        
        distance = math.sqrt(
            (lat - self.center_lat) ** 2 + (lon - self.center_lon) ** 2
        )
        distance_factor = max(0.3, 1.0 - distance * 10)
        
        noise = random.uniform(-0.1, 0.1)
        
        density = base_density * distance_factor + noise
        return max(0.1, min(1.0, density))
    
    def generate_nests(self, num_nests: int = None) -> List[Nest]:
        if not self.grid_cells:
            self.generate_grid()
        
        num_nests = num_nests or self.num_nests
        
        weighted_cells = []
        for cell in self.grid_cells:
            weight = cell.demand_density * 10
            weighted_cells.extend([cell] * int(weight))
        
        self.nests = []
        used_positions = set()
        
        for i in range(num_nests):
            if not weighted_cells:
                break
            
            cell = random.choice(weighted_cells)
            
            attempts = 0
            while (cell.lat, cell.lon) in used_positions and attempts < 100:
                cell = random.choice(weighted_cells)
                attempts += 1
            
            if (cell.lat, cell.lon) in used_positions:
                lat = cell.lat + random.uniform(-self.grid_size/4, self.grid_size/4)
                lon = cell.lon + random.uniform(-self.grid_size/4, self.grid_size/4)
            else:
                lat = cell.lat + random.uniform(-self.grid_size/4, self.grid_size/4)
                lon = cell.lon + random.uniform(-self.grid_size/4, self.grid_size/4)
            
            used_positions.add((lat, lon))
            
            region_names = self._region_names.get(cell.region_type, ["未知区域"])
            name = f"{random.choice(region_names)}-{i+1:03d}"
            
            capacity = self._determine_capacity(cell.region_type)
            
            nest = Nest(
                id=f"NEST-{i+1:04d}",
                name=name,
                position=Position(lat=lat, lon=lon),
                capacity=capacity,
                status=NestStatus.AVAILABLE,
                region_type=cell.region_type,
                demand_density=cell.demand_density,
                historical_usage_rate=random.uniform(0.3, 0.8),
            )
            
            self.nests.append(nest)
            cell.nest_count += 1
        
        return self.nests
    
    def _determine_capacity(self, region_type: str) -> int:
        capacity_map = {
            RegionType.COMMERCIAL.value: random.choice([4, 6, 8]),
            RegionType.RESIDENTIAL.value: random.choice([2, 4, 4]),
            RegionType.INDUSTRIAL.value: random.choice([4, 6, 6]),
            RegionType.EMERGENCY.value: random.choice([6, 8, 10]),
        }
        return capacity_map.get(region_type, 4)
    
    def get_nests_by_region(self, region_type: str) -> List[Nest]:
        return [nest for nest in self.nests if nest.region_type == region_type]
    
    def get_nearest_nests(self, position: Position, k: int = 5) -> List[Tuple[Nest, float]]:
        nest_distances = []
        for nest in self.nests:
            if nest.is_available():
                distance = position.distance_to(nest.position)
                nest_distances.append((nest, distance))
        
        nest_distances.sort(key=lambda x: x[1])
        return nest_distances[:k]
    
    def get_nests_in_radius(self, position: Position, radius: float) -> List[Nest]:
        nearby_nests = []
        for nest in self.nests:
            distance = position.distance_to(nest.position)
            if distance <= radius:
                nearby_nests.append(nest)
        return nearby_nests
    
    def calculate_region_statistics(self) -> Dict[str, Dict]:
        stats = {}
        
        for region_type in self.region_distribution.keys():
            region_nests = self.get_nests_by_region(region_type)
            
            if region_nests:
                total_capacity = sum(n.capacity for n in region_nests)
                total_available = sum(n.available_slots() for n in region_nests)
                avg_demand = np.mean([n.demand_density for n in region_nests])
                avg_usage = np.mean([n.historical_usage_rate for n in region_nests])
                
                stats[region_type] = {
                    "nest_count": len(region_nests),
                    "total_capacity": total_capacity,
                    "total_available": total_available,
                    "avg_demand_density": avg_demand,
                    "avg_usage_rate": avg_usage,
                }
        
        return stats
    
    def to_dict(self) -> Dict:
        return {
            "center_lat": self.center_lat,
            "center_lon": self.center_lon,
            "grid_size": self.grid_size,
            "num_nests": len(self.nests),
            "num_grid_cells": len(self.grid_cells),
            "region_distribution": self.region_distribution,
            "nests": [nest.to_dict() for nest in self.nests],
            "region_statistics": self.calculate_region_statistics(),
        }
    
    def export_to_geojson(self) -> Dict:
        features = []
        
        for nest in self.nests:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [nest.position.lon, nest.position.lat],
                },
                "properties": {
                    "id": nest.id,
                    "name": nest.name,
                    "capacity": nest.capacity,
                    "available_slots": nest.available_slots(),
                    "region_type": nest.region_type,
                    "demand_density": nest.demand_density,
                    "status": nest.status.value,
                }
            }
            features.append(feature)
        
        return {
            "type": "FeatureCollection",
            "features": features,
        }
