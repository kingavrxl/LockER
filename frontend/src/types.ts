export type DriverStatus = 'UP_TO_DATE' | 'OVERDUE_1' | 'OVERDUE_2' | 'OVERDUE_3' | 'LOCKED';

export interface Driver {
  id: number;
  full_name: string;
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
  serial_number?: string;
  model: string;
  is_locked: boolean;
  lock_reason?: string;
  last_heartbeat?: string;
  lease_expires_at?: string;
  latitude?: number;
  longitude?: number;
  ip_address?: string;
  mac_address?: string;
  network_operator?: string;
  wifi_ssid?: string;
  battery_level?: number;
  app_version?: string;
  created_at?: string;
}

export interface SecurityAlert {
  id: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO' | 'SECURE';
  category: string;
  title: string;
  description: string;
  timestamp: string;
  action_recommended: string;
  driver_id?: number;
  driver_name?: string;
  device_id?: number;
  imei?: string;
}

export interface LockybeeAudit {
  agent: string;
  status: string;
  security_score: number;
  audit_timestamp: string;
  metrics: {
    total_drivers: number;
    total_devices: number;
    active_devices: number;
    overdue_devices: number;
    locked_devices: number;
    offline_24h_count: number;
    critical_offline_count: number;
    low_battery_count: number;
    gps_active_count: number;
    gps_coverage_percent: number;
    recent_payments_count: number;
  };
  alerts: SecurityAlert[];
  engine: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'lockybee';
  text: string;
  timestamp: string;
  suggestions?: string[];
}

export interface PaymentScheduleRule {
  id: number;
  title: string;
  due_date_str: string;
  due_day?: number;
  due_month?: number;
  due_year?: number;
  amount_xof: number;
  payment_method: string;
  payment_instructions?: string;
  grace_period_days: number;
  driver_id?: number;
  is_active: boolean;
  created_at: string;
}
