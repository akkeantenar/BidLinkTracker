export type UserRole = 'bid-manager' | 'bidder';

export interface User {
  role: UserRole;
  name: string; // Full name
  email: string;
}

export interface StoredUser {
  email: string;
  fullName: string;
  password: string; // In production, this would be hashed
  role: UserRole;
  createdAt: string;
}

export interface JobEntry {
  date: string;
  no: number;
  jobSite: string;
  companyName: string;
  position: string;
  jobUrl: string;
  appliedUrl: string;
  approved: boolean;
  feedback: string;
  bonus: string;
}

export interface DuplicateInfo {
  url: string;
  tabName: string;
  rowIndex: number;
  position: string;
  date?: string; // Column A
  no?: string; // Column B
  companyName?: string; // Column D
  isDuplicate: boolean;
  sourceColumn?: 'F' | 'G'; // Column F (Job Url) or Column G (Applied Url)
}

export interface TabInfo {
  name: string;
  startDate: Date;
  endDate: Date;
}

