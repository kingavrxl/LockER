export type DriverStatus = 'UP_TO_DATE' | 'OVERDUE_1' | 'OVERDUE_2' | 'OVERDUE_3' | 'LOCKED';

export interface Driver {
  id: number;
  full_name: str;
  phone_number: string;
  national_id?: string;
  vehicle_plate?: string;
  daily_rate_xof: number;
  current_status: DriverStatus;
  consecutive_overdue_days: number;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: number;
  driver_id?: number;
  imei: string;
  model: string;
  is_locked: boolean;
  lock_reason?: string;
  last_heartbeat?: string;
  lease_expires_at?: string;
}

export interface StatsOverview {
  total_drivers: number;
  up_to_date: number;
  overdue: number;
  locked: number;
  total_collected_today_xof: number;
}
