// Seed data for `airports`: Vietnam + Southeast Asia + a few popular East Asia destinations.
// Names are the common English airport names; city_vi is what Vietnamese users type.

import { normalizeSearch } from '@/lib/utils/text'
import type { NewAirport } from '../schema'

export interface AirportSeed {
  iata: string
  name: string
  city: string
  cityVi?: string
  countryCode: string
  timezone: string
}

const VN = { countryCode: 'VN', timezone: 'Asia/Ho_Chi_Minh' } as const

export const AIRPORTS: AirportSeed[] = [
  // Vietnam
  { iata: 'HAN', name: 'Noi Bai International', city: 'Hanoi', cityVi: 'Hà Nội', ...VN },
  { iata: 'SGN', name: 'Tan Son Nhat International', city: 'Ho Chi Minh City', cityVi: 'Hồ Chí Minh Sài Gòn', ...VN },
  { iata: 'DAD', name: 'Da Nang International', city: 'Da Nang', cityVi: 'Đà Nẵng', ...VN },
  { iata: 'CXR', name: 'Cam Ranh International', city: 'Nha Trang', cityVi: 'Nha Trang Khánh Hòa', ...VN },
  { iata: 'PQC', name: 'Phu Quoc International', city: 'Phu Quoc', cityVi: 'Phú Quốc', ...VN },
  { iata: 'HPH', name: 'Cat Bi International', city: 'Hai Phong', cityVi: 'Hải Phòng', ...VN },
  { iata: 'VII', name: 'Vinh International', city: 'Vinh', cityVi: 'Vinh Nghệ An', ...VN },
  { iata: 'HUI', name: 'Phu Bai International', city: 'Hue', cityVi: 'Huế', ...VN },
  { iata: 'VCA', name: 'Can Tho International', city: 'Can Tho', cityVi: 'Cần Thơ', ...VN },
  { iata: 'DLI', name: 'Lien Khuong', city: 'Da Lat', cityVi: 'Đà Lạt', ...VN },
  { iata: 'UIH', name: 'Phu Cat', city: 'Quy Nhon', cityVi: 'Quy Nhơn Bình Định', ...VN },
  { iata: 'BMV', name: 'Buon Ma Thuot', city: 'Buon Ma Thuot', cityVi: 'Buôn Ma Thuột', ...VN },
  { iata: 'PXU', name: 'Pleiku', city: 'Pleiku', cityVi: 'Pleiku Gia Lai', ...VN },
  { iata: 'THD', name: 'Tho Xuan', city: 'Thanh Hoa', cityVi: 'Thanh Hóa', ...VN },
  { iata: 'VDO', name: 'Van Don International', city: 'Ha Long', cityVi: 'Vân Đồn Hạ Long Quảng Ninh', ...VN },
  { iata: 'VCL', name: 'Chu Lai', city: 'Tam Ky', cityVi: 'Chu Lai Quảng Nam', ...VN },
  { iata: 'TBB', name: 'Tuy Hoa', city: 'Tuy Hoa', cityVi: 'Tuy Hòa Phú Yên', ...VN },
  { iata: 'VKG', name: 'Rach Gia', city: 'Rach Gia', cityVi: 'Rạch Giá Kiên Giang', ...VN },
  { iata: 'CAH', name: 'Ca Mau', city: 'Ca Mau', cityVi: 'Cà Mau', ...VN },
  { iata: 'VCS', name: 'Con Dao', city: 'Con Dao', cityVi: 'Côn Đảo', ...VN },
  { iata: 'DIN', name: 'Dien Bien Phu', city: 'Dien Bien Phu', cityVi: 'Điện Biên', ...VN },
  { iata: 'VDH', name: 'Dong Hoi', city: 'Dong Hoi', cityVi: 'Đồng Hới Quảng Bình', ...VN },

  // Southeast Asia
  { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', cityVi: 'Bangkok Thái Lan', countryCode: 'TH', timezone: 'Asia/Bangkok' },
  { iata: 'DMK', name: 'Don Mueang International', city: 'Bangkok', cityVi: 'Bangkok Thái Lan', countryCode: 'TH', timezone: 'Asia/Bangkok' },
  { iata: 'HKT', name: 'Phuket International', city: 'Phuket', cityVi: 'Phuket Thái Lan', countryCode: 'TH', timezone: 'Asia/Bangkok' },
  { iata: 'CNX', name: 'Chiang Mai International', city: 'Chiang Mai', cityVi: 'Chiang Mai Thái Lan', countryCode: 'TH', timezone: 'Asia/Bangkok' },
  { iata: 'SIN', name: 'Changi', city: 'Singapore', cityVi: 'Singapore', countryCode: 'SG', timezone: 'Asia/Singapore' },
  { iata: 'KUL', name: 'Kuala Lumpur International', city: 'Kuala Lumpur', cityVi: 'Kuala Lumpur Malaysia', countryCode: 'MY', timezone: 'Asia/Kuala_Lumpur' },
  { iata: 'PEN', name: 'Penang International', city: 'Penang', cityVi: 'Penang Malaysia', countryCode: 'MY', timezone: 'Asia/Kuala_Lumpur' },
  { iata: 'CGK', name: 'Soekarno-Hatta International', city: 'Jakarta', cityVi: 'Jakarta Indonesia', countryCode: 'ID', timezone: 'Asia/Jakarta' },
  { iata: 'DPS', name: 'Ngurah Rai International', city: 'Bali', cityVi: 'Bali Indonesia', countryCode: 'ID', timezone: 'Asia/Makassar' },
  { iata: 'MNL', name: 'Ninoy Aquino International', city: 'Manila', cityVi: 'Manila Philippines', countryCode: 'PH', timezone: 'Asia/Manila' },
  { iata: 'CEB', name: 'Mactan-Cebu International', city: 'Cebu', cityVi: 'Cebu Philippines', countryCode: 'PH', timezone: 'Asia/Manila' },
  { iata: 'VTE', name: 'Wattay International', city: 'Vientiane', cityVi: 'Viêng Chăn Lào', countryCode: 'LA', timezone: 'Asia/Vientiane' },
  { iata: 'LPQ', name: 'Luang Prabang International', city: 'Luang Prabang', cityVi: 'Luang Prabang Lào', countryCode: 'LA', timezone: 'Asia/Vientiane' },
  { iata: 'RGN', name: 'Yangon International', city: 'Yangon', cityVi: 'Yangon Myanmar', countryCode: 'MM', timezone: 'Asia/Yangon' },

  // East Asia (popular from Vietnam)
  { iata: 'ICN', name: 'Incheon International', city: 'Seoul', cityVi: 'Seoul Hàn Quốc', countryCode: 'KR', timezone: 'Asia/Seoul' },
  { iata: 'PUS', name: 'Gimhae International', city: 'Busan', cityVi: 'Busan Hàn Quốc', countryCode: 'KR', timezone: 'Asia/Seoul' },
  { iata: 'NRT', name: 'Narita International', city: 'Tokyo', cityVi: 'Tokyo Nhật Bản', countryCode: 'JP', timezone: 'Asia/Tokyo' },
  { iata: 'KIX', name: 'Kansai International', city: 'Osaka', cityVi: 'Osaka Nhật Bản', countryCode: 'JP', timezone: 'Asia/Tokyo' },
  { iata: 'TPE', name: 'Taoyuan International', city: 'Taipei', cityVi: 'Đài Bắc Đài Loan', countryCode: 'TW', timezone: 'Asia/Taipei' },
  { iata: 'HKG', name: 'Hong Kong International', city: 'Hong Kong', cityVi: 'Hồng Kông', countryCode: 'HK', timezone: 'Asia/Hong_Kong' },
]

export function airportRows(seeds: AirportSeed[] = AIRPORTS): NewAirport[] {
  return seeds.map((a) => ({
    iata: a.iata,
    name: a.name,
    city: a.city,
    cityVi: a.cityVi ?? null,
    countryCode: a.countryCode,
    timezone: a.timezone,
    searchText: normalizeSearch([a.iata, a.name, a.city, a.cityVi].filter(Boolean).join(' ')),
  }))
}
