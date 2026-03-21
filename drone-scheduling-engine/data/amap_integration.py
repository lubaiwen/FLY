import os
import json
import requests
import numpy as np
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import time
from pathlib import Path

from config import settings


@dataclass
class POI:
    id: str
    name: str
    type: str
    location: Tuple[float, float]
    address: str
    distance: float = 0.0
    

@dataclass
class RoadSegment:
    id: str
    name: str
    start_point: Tuple[float, float]
    end_point: Tuple[float, float]
    length: float
    level: int
    traffic_status: int = 0


@dataclass
class Building3D:
    id: str
    name: str
    location: Tuple[float, float]
    height: float
    footprint: List[Tuple[float, float]]
    type: str


@dataclass
class WeatherData:
    city: str
    weather: str
    temperature: float
    humidity: float
    wind_speed: float
    wind_direction: str
    visibility: float
    timestamp: datetime


class AmapAPI:
    
    BASE_URL = "https://restapi.amap.com/v3"
    
    def __init__(self, api_key: str = None, security_key: str = None):
        self.api_key = api_key or os.getenv("AMAP_API_KEY", "") or settings.amap.api_key
        self.security_key = security_key or os.getenv("AMAP_SECURITY_KEY", "") or settings.amap.security_key
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "DroneSchedulingSystem/1.0"
        })
        self.cache_dir = Path("data/amap_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.request_interval = 0.1
        self.last_request_time = 0
        
        if self.api_key:
            print(f"高德地图API已配置: {self.api_key[:8]}...")
        else:
            print("警告: 未配置高德地图API密钥，请设置AMAP_API_KEY环境变量")
    
    def _rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.request_interval:
            time.sleep(self.request_interval - elapsed)
        self.last_request_time = time.time()
    
    def _get_cache_path(self, endpoint: str, params: Dict) -> Path:
        cache_key = f"{endpoint}_{hash(frozenset(params.items()))}"
        return self.cache_dir / f"{cache_key}.json"
    
    def _load_cache(self, cache_path: Path) -> Optional[Dict]:
        if cache_path.exists():
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                cache_time = data.get("cache_time", 0)
                if time.time() - cache_time < 3600:
                    return data.get("response")
        return None
    
    def _save_cache(self, cache_path: Path, response: Dict):
        data = {
            "cache_time": time.time(),
            "response": response
        }
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def _request(self, endpoint: str, params: Dict) -> Dict:
        self._rate_limit()
        
        cache_path = self._get_cache_path(endpoint, params)
        cached = self._load_cache(cache_path)
        if cached:
            return cached
        
        params["key"] = self.api_key
        params["output"] = "json"
        
        url = f"{self.BASE_URL}/{endpoint}"
        
        try:
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get("status") != "1":
                print(f"API Error: {data.get('info')}")
                return {}
            
            self._save_cache(cache_path, data)
            return data
        except Exception as e:
            print(f"Request failed: {e}")
            return {}
    
    def geocode(self, address: str, city: str = None) -> Optional[Tuple[float, float]]:
        params = {"address": address}
        if city:
            params["city"] = city
        
        data = self._request("geocode/geo", params)
        
        if data and "geocodes" in data and data["geocodes"]:
            location = data["geocodes"][0]["location"]
            lon, lat = map(float, location.split(","))
            return (lat, lon)
        return None
    
    def reverse_geocode(self, lat: float, lon: float) -> Dict:
        params = {"location": f"{lon},{lat}"}
        return self._request("geocode/regeo", params)
    
    def search_pois(
        self,
        keywords: str,
        location: Tuple[float, float] = None,
        radius: int = 3000,
        types: str = None,
        offset: int = 50,
        page: int = 1,
    ) -> List[POI]:
        params = {
            "keywords": keywords,
            "offset": offset,
            "page": page,
            "extensions": "all",
        }
        
        if location:
            params["location"] = f"{location[1]},{location[0]}"
            params["radius"] = radius
        
        if types:
            params["types"] = types
        
        data = self._request("place/around", params)
        
        pois = []
        if data and "pois" in data:
            for poi_data in data["pois"]:
                loc = poi_data.get("location", "").split(",")
                if len(loc) == 2:
                    poi = POI(
                        id=poi_data.get("id", ""),
                        name=poi_data.get("name", ""),
                        type=poi_data.get("type", ""),
                        location=(float(loc[1]), float(loc[0])),
                        address=poi_data.get("address", ""),
                        distance=float(poi_data.get("distance", 0)),
                    )
                    pois.append(poi)
        
        return pois
    
    def get_district(self, keywords: str, subdistrict: int = 1) -> List[Dict]:
        params = {
            "keywords": keywords,
            "subdistrict": subdistrict,
            "extensions": "base",
        }
        data = self._request("config/district", params)
        
        if data and "districts" in data:
            return data["districts"]
        return []
    
    def get_weather(self, city: str, extensions: str = "base") -> Optional[WeatherData]:
        params = {
            "city": city,
            "extensions": extensions,
        }
        data = self._request("weather/weatherInfo", params)
        
        if data and "lives" in data and data["lives"]:
            live = data["lives"][0]
            return WeatherData(
                city=live.get("city", ""),
                weather=live.get("weather", ""),
                temperature=float(live.get("temperature", 0)),
                humidity=float(live.get("humidity", 0)),
                wind_speed=float(live.get("windpower", "0").replace("-", "0") or 0),
                wind_direction=live.get("winddirection", ""),
                visibility=float(live.get("visibility", "0") or 0),
                timestamp=datetime.now(),
            )
        return None
    
    def get_traffic_status(
        self,
        location: Tuple[float, float],
        radius: int = 1000,
    ) -> List[Dict]:
        params = {
            "location": f"{location[1]},{location[0]}",
            "radius": radius,
            "level": 5,
            "extensions": "all",
        }
        data = self._request("traffic/status/around", params)
        
        if data and "trafficinfo" in data:
            return data["trafficinfo"].get("evaluation", [])
        return []
    
    def create_static_map(
        self,
        center: Tuple[float, float],
        zoom: int = 12,
        size: str = "800*600",
        markers: List[Dict] = None,
    ) -> Optional[str]:
        params = {
            "location": f"{center[1]},{center[0]}",
            "zoom": zoom,
            "size": size,
        }
        
        if markers:
            marker_strs = []
            for m in markers:
                loc = m.get("location", (0, 0))
                marker_strs.append(f"{loc[1]},{loc[0]}")
            params["markers"] = f"mid,0xFF0000,A:{";".join(marker_strs)}"
        
        url = f"{self.BASE_URL}/staticmap?{'&'.join(f'{k}={v}' for k, v in params.items())}&key={self.api_key}"
        return url


class GeoDataProcessor:
    
    def __init__(self, amap_api: AmapAPI = None):
        self.amap = amap_api or AmapAPI()
        
        self.poi_type_mapping = {
            "商业区": ["050100", "050200", "050300"],
            "住宅区": ["120300", "120301", "120302"],
            "工业区": ["130100", "130200", "130300"],
            "应急设施": ["190300", "190400", "190500"],
            "医院": ["090100", "090200", "090300"],
            "学校": ["140100", "140200", "140300"],
            "交通枢纽": ["150100", "150200", "150300"],
        }
    
    def get_region_pois(
        self,
        center: Tuple[float, float],
        radius: int = 5000,
        categories: List[str] = None,
    ) -> Dict[str, List[POI]]:
        categories = categories or list(self.poi_type_mapping.keys())
        
        all_pois = {}
        
        for category in categories:
            type_codes = self.poi_type_mapping.get(category, [])
            category_pois = []
            
            for type_code in type_codes:
                pois = self.amap.search_pois(
                    keywords="",
                    location=center,
                    radius=radius,
                    types=type_code,
                )
                category_pois.extend(pois)
            
            all_pois[category] = category_pois
        
        return all_pois
    
    def calculate_demand_density(
        self,
        location: Tuple[float, float],
        radius: int = 1000,
    ) -> float:
        pois = self.amap.search_pois(
            keywords="",
            location=location,
            radius=radius,
        )
        
        density = len(pois) / (np.pi * radius * radius / 1000000)
        
        return min(1.0, density / 100)
    
    def get_3d_buildings(
        self,
        bounds: Tuple[float, float, float, float],
    ) -> List[Building3D]:
        min_lat, min_lon, max_lat, max_lon = bounds
        
        buildings = []
        
        center_lat = (min_lat + max_lat) / 2
        center_lon = (min_lon + max_lon) / 2
        
        pois = self.amap.search_pois(
            keywords="建筑",
            location=(center_lat, center_lon),
            radius=int((max_lat - min_lat) * 111000 / 2),
        )
        
        for poi in pois:
            height = self._estimate_building_height(poi.type)
            
            building = Building3D(
                id=poi.id,
                name=poi.name,
                location=poi.location,
                height=height,
                footprint=self._generate_footprint(poi.location, height),
                type=poi.type,
            )
            buildings.append(building)
        
        return buildings
    
    def _estimate_building_height(self, building_type: str) -> float:
        height_ranges = {
            "商业": (50, 200),
            "住宅": (20, 100),
            "工业": (10, 30),
            "办公": (30, 150),
            "医院": (20, 80),
            "学校": (10, 30),
        }
        
        for key, (min_h, max_h) in height_ranges.items():
            if key in building_type:
                return np.random.uniform(min_h, max_h)
        
        return np.random.uniform(10, 50)
    
    def _generate_footprint(
        self,
        center: Tuple[float, float],
        height: float,
    ) -> List[Tuple[float, float]]:
        size = height / 500
        lat, lon = center
        
        footprint = [
            (lat - size, lon - size),
            (lat - size, lon + size),
            (lat + size, lon + size),
            (lat + size, lon - size),
        ]
        
        return footprint
    
    def get_terrain_data(
        self,
        bounds: Tuple[float, float, float, float],
        resolution: int = 100,
    ) -> np.ndarray:
        min_lat, min_lon, max_lat, max_lon = bounds
        
        lats = np.linspace(min_lat, max_lat, resolution)
        lons = np.linspace(min_lon, max_lon, resolution)
        
        terrain = np.zeros((resolution, resolution))
        
        for i, lat in enumerate(lats):
            for j, lon in enumerate(lons):
                terrain[i, j] = self._get_elevation(lat, lon)
        
        return terrain
    
    def _get_elevation(self, lat: float, lon: float) -> float:
        return np.random.uniform(10, 50)
    
    def create_spatial_features(
        self,
        location: Tuple[float, float],
        radius: int = 2000,
    ) -> np.ndarray:
        features = np.zeros(64)
        
        pois_by_category = self.get_region_pois(location, radius)
        
        idx = 0
        for category, pois in pois_by_category.items():
            features[idx] = len(pois) / 100
            idx += 1
        
        weather = self.amap.get_weather("合肥")
        if weather:
            features[8] = weather.temperature / 40
            features[9] = weather.humidity / 100
            features[10] = weather.wind_speed / 10
            features[11] = weather.visibility / 30
        
        traffic = self.amap.get_traffic_status(location, radius)
        if traffic:
            features[12] = len(traffic) / 10
        
        features[13] = self.calculate_demand_density(location, radius)
        
        reverse_geo = self.amap.reverse_geocode(location[0], location[1])
        if reverse_geo and "regeocode" in reverse_geo:
            address = reverse_geo["regeocode"].get("formatted_address", "")
            features[14] = 1.0 if "商业" in address else 0.0
            features[15] = 1.0 if "住宅" in address else 0.0
        
        return features


class RealWorldEnvironment:
    
    def __init__(
        self,
        city: str = "合肥",
        api_key: str = None,
        use_cache: bool = True,
    ):
        self.city = city
        self.amap = AmapAPI(api_key)
        self.processor = GeoDataProcessor(self.amap)
        
        self.city_center = self._get_city_center(city)
        self.use_cache = use_cache
        
        self.cached_data: Dict[str, Any] = {}
    
    def _get_city_center(self, city: str) -> Tuple[float, float]:
        known_centers = {
            "合肥": (31.8206, 117.2272),
            "北京": (39.9042, 116.4074),
            "上海": (31.2304, 121.4737),
            "深圳": (22.5431, 114.0579),
            "广州": (23.1291, 113.2644),
        }
        
        if city in known_centers:
            return known_centers[city]
        
        location = self.amap.geocode(city)
        if location:
            return location
        
        return (31.8206, 117.2272)
    
    def generate_nest_locations(
        self,
        num_nests: int = 50,
        radius_km: float = 10,
    ) -> List[Dict]:
        if self.use_cache and "nests" in self.cached_data:
            return self.cached_data["nests"]
        
        nests = []
        
        pois_by_category = self.processor.get_region_pois(
            self.city_center,
            radius=int(radius_km * 1000),
        )
        
        candidates = []
        for category, pois in pois_by_category.items():
            for poi in pois:
                candidates.append({
                    "location": poi.location,
                    "name": poi.name,
                    "type": category,
                    "demand": self.processor.calculate_demand_density(poi.location, 1000),
                })
        
        if candidates:
            selected = np.random.choice(
                len(candidates),
                size=min(num_nests, len(candidates)),
                replace=False
            )
            
            for idx in selected:
                candidate = candidates[idx]
                nest = {
                    "id": f"NEST-{len(nests)+1:04d}",
                    "name": candidate["name"],
                    "lat": candidate["location"][0],
                    "lon": candidate["location"][1],
                    "region_type": self._map_region_type(candidate["type"]),
                    "demand_density": candidate["demand"],
                    "capacity": self._determine_capacity(candidate["type"]),
                }
                nests.append(nest)
        
        while len(nests) < num_nests:
            angle = np.random.uniform(0, 2 * np.pi)
            distance = np.random.uniform(0.5, radius_km)
            
            lat = self.city_center[0] + distance * np.cos(angle) / 111
            lon = self.city_center[1] + distance * np.sin(angle) / (111 * np.cos(np.radians(self.city_center[0])))
            
            nest = {
                "id": f"NEST-{len(nests)+1:04d}",
                "name": f"机槽-{len(nests)+1}",
                "lat": lat,
                "lon": lon,
                "region_type": np.random.choice(["commercial", "residential", "industrial", "emergency"]),
                "demand_density": self.processor.calculate_demand_density((lat, lon), 1000),
                "capacity": np.random.choice([4, 6, 8]),
            }
            nests.append(nest)
        
        self.cached_data["nests"] = nests
        return nests
    
    def _map_region_type(self, poi_type: str) -> str:
        mapping = {
            "商业区": "commercial",
            "住宅区": "residential",
            "工业区": "industrial",
            "应急设施": "emergency",
            "医院": "emergency",
            "学校": "residential",
            "交通枢纽": "commercial",
        }
        return mapping.get(poi_type, "residential")
    
    def _determine_capacity(self, poi_type: str) -> int:
        capacity_map = {
            "商业区": 8,
            "住宅区": 4,
            "工业区": 6,
            "应急设施": 10,
            "医院": 8,
            "学校": 4,
            "交通枢纽": 8,
        }
        return capacity_map.get(poi_type, 4)
    
    def get_weather_features(self) -> np.ndarray:
        weather = self.amap.get_weather(self.city)
        
        if weather:
            return np.array([
                weather.temperature / 40,
                weather.humidity / 100,
                weather.wind_speed / 10,
                1.0 if "雨" in weather.weather else 0.0,
                1.0 if "雪" in weather.weather else 0.0,
                weather.visibility / 30,
            ])
        
        return np.zeros(6)
    
    def get_3d_environment_data(
        self,
        bounds: Tuple[float, float, float, float] = None,
    ) -> Dict:
        if bounds is None:
            lat, lon = self.city_center
            bounds = (lat - 0.1, lon - 0.1, lat + 0.1, lon + 0.1)
        
        return {
            "buildings": self.processor.get_3d_buildings(bounds),
            "terrain": self.processor.get_terrain_data(bounds, 50),
            "pois": self.processor.get_region_pois(self.city_center, 5000),
        }
    
    def export_to_geojson(self, nests: List[Dict]) -> Dict:
        features = []
        
        for nest in nests:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [nest["lon"], nest["lat"]],
                },
                "properties": {
                    "id": nest["id"],
                    "name": nest["name"],
                    "region_type": nest["region_type"],
                    "demand_density": nest["demand_density"],
                    "capacity": nest["capacity"],
                }
            }
            features.append(feature)
        
        return {
            "type": "FeatureCollection",
            "features": features,
        }


def setup_amap_environment(
    city: str = "合肥",
    api_key: str = None,
    num_nests: int = 50,
    output_file: str = None,
) -> Dict:
    env = RealWorldEnvironment(city=city, api_key=api_key)
    
    print(f"正在获取 {city} 的地理数据...")
    
    nests = env.generate_nest_locations(num_nests)
    weather_features = env.get_weather_features()
    
    result = {
        "city": city,
        "center": env.city_center,
        "nests": nests,
        "weather_features": weather_features.tolist(),
        "generated_at": datetime.now().isoformat(),
    }
    
    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"数据已保存到 {output_file}")
    
    return result


if __name__ == "__main__":
    setup_amap_environment(
        city="合肥",
        num_nests=50,
        output_file="data/real_world_environment.json",
    )
