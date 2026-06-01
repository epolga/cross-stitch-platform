export interface User {
  ID: string;
  NPage: string;
  EntityType: string;
  FName: string;
  UserName: string;
  DateCreated: string;
  LastLoginDate: string;
  ReceiveUpdates: boolean
  PayingDate?: string;
  PayedAmount: number;
  IsRecurring: boolean;
  PayerID: string;
  Deleted: boolean;
  OldEmailID: number;
  IP: string;
  FirstPayingDate?: string;
  OpenPwd: string;
}

export interface UsersResponse {
  users: User[];
  entryCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}