export interface AdminRecord {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  userAgent?: string | null;
}

export interface AuthBootstrapStatus {
  requiresSetup: boolean;
  hasSession: boolean;
  username?: string;
}

export interface SessionView {
  username: string;
  expiresAt: string;
}
