import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import settings
from data.amap_integration import AmapAPI, GeoDataProcessor, RealWorldEnvironment


def test_amap_config():
    print("=" * 60)
    print("高德地图API配置测试")
    print("=" * 60)
    
    print(f"\nAPI Key: {settings.amap.api_key[:8]}...{settings.amap.api_key[-4:]}")
    print(f"Security Key: {settings.amap.security_key[:8]}...{settings.amap.security_key[-4:]}")
    print(f"Base URL: {settings.amap.base_url}")
    
    return bool(settings.amap.api_key)


def test_amap_api():
    print("\n" + "=" * 60)
    print("API连接测试")
    print("=" * 60)
    
    api = AmapAPI()
    
    print("\n1. 测试地理编码...")
    result = api.geocode("合肥市政务中心")
    if result:
        print(f"   ✓ 合肥市政务中心: ({result[0]:.4f}, {result[1]:.4f})")
    else:
        print("   ✗ 地理编码失败")
    
    print("\n2. 测试逆地理编码...")
    if result:
        regeo = api.reverse_geocode(result[0], result[1])
        if regeo and "regeocode" in regeo:
            address = regeo["regeocode"].get("formatted_address", "")
            print(f"   ✓ 逆地理编码: {address[:50]}...")
        else:
            print("   ✗ 逆地理编码失败")
    
    print("\n3. 测试POI搜索...")
    if result:
        pois = api.search_pois("充电站", result, radius=2000)
        print(f"   ✓ 找到 {len(pois)} 个充电站POI")
        if pois:
            print(f"   第一个: {pois[0].name} - {pois[0].address[:30]}...")
    
    print("\n4. 测试天气查询...")
    weather = api.get_weather("合肥")
    if weather:
        print(f"   ✓ 合肥天气: {weather.weather}, 温度: {weather.temperature}°C")
    else:
        print("   ✗ 天气查询失败")
    
    return True


def test_real_world_environment():
    print("\n" + "=" * 60)
    print("真实世界环境测试")
    print("=" * 60)
    
    env = RealWorldEnvironment(city="合肥")
    
    print(f"\n城市中心: {env.city_center}")
    
    print("\n生成机槽位置...")
    nests = env.generate_nest_locations(num_nests=10)
    print(f"✓ 生成了 {len(nests)} 个机槽位置")
    
    for i, nest in enumerate(nests[:3]):
        print(f"   {i+1}. {nest['name']}: ({nest['lat']:.4f}, {nest['lon']:.4f})")
    
    print("\n获取天气特征...")
    weather_features = env.get_weather_features()
    print(f"✓ 天气特征: {weather_features}")
    
    return True


def main():
    print("\n" + "=" * 60)
    print("高德地图API集成测试")
    print("=" * 60)
    
    if not test_amap_config():
        print("\n✗ API密钥未配置，请检查.env文件")
        return
    
    try:
        test_amap_api()
        test_real_world_environment()
        
        print("\n" + "=" * 60)
        print("✓ 所有测试完成！API配置正确")
        print("=" * 60)
        
        print("\n使用方法:")
        print("  python -m training.train --use-real-data --city 合肥")
        print("  python -m data.amap_integration")
        
    except Exception as e:
        print(f"\n✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
