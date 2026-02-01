/**
 * Coordinate conversion utilities.
 * WGS84 <-> GCJ-02 <-> BD09 for future Baidu/Amap provider support.
 *
 * WGS84: GPS standard (used by Google Maps, OSM)
 * GCJ-02: Chinese government offset ("Mars coordinates", used by Amap/Gaode)
 * BD09: Baidu's additional offset on top of GCJ-02
 */

const PI = Math.PI;
const SEMI_MAJOR_AXIS = 6378245.0;
const ECCENTRICITY_SQUARED = 0.00669342162296594323;

function isOutOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS84 -> GCJ-02 */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (isOutOfChina(lat, lng)) return { lat, lng };

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - ECCENTRICITY_SQUARED * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((SEMI_MAJOR_AXIS / sqrtMagic) * Math.cos(radLat) * PI);

  return { lat: lat + dLat, lng: lng + dLng };
}

/** GCJ-02 -> WGS84 (iterative approach for higher precision) */
export function gcj02ToWgs84(gcjLat: number, gcjLng: number): { lat: number; lng: number } {
  if (isOutOfChina(gcjLat, gcjLng)) return { lat: gcjLat, lng: gcjLng };

  let wgsLat = gcjLat;
  let wgsLng = gcjLng;

  for (let i = 0; i < 5; i++) {
    const gcj = wgs84ToGcj02(wgsLat, wgsLng);
    wgsLat += gcjLat - gcj.lat;
    wgsLng += gcjLng - gcj.lng;
  }

  return { lat: wgsLat, lng: wgsLng };
}

/** GCJ-02 -> BD09 */
export function gcj02ToBd09(gcjLat: number, gcjLng: number): { lat: number; lng: number } {
  const x = gcjLng;
  const y = gcjLat;
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * PI * 3000.0 / 180.0);
  return {
    lat: z * Math.sin(theta) + 0.006,
    lng: z * Math.cos(theta) + 0.0065,
  };
}

/** BD09 -> GCJ-02 */
export function bd09ToGcj02(bdLat: number, bdLng: number): { lat: number; lng: number } {
  const x = bdLng - 0.0065;
  const y = bdLat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI * 3000.0 / 180.0);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI * 3000.0 / 180.0);
  return {
    lat: z * Math.sin(theta),
    lng: z * Math.cos(theta),
  };
}

/** WGS84 -> BD09 (convenience) */
export function wgs84ToBd09(lat: number, lng: number): { lat: number; lng: number } {
  const gcj = wgs84ToGcj02(lat, lng);
  return gcj02ToBd09(gcj.lat, gcj.lng);
}

/** BD09 -> WGS84 (convenience) */
export function bd09ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  const gcj = bd09ToGcj02(lat, lng);
  return gcj02ToWgs84(gcj.lat, gcj.lng);
}
