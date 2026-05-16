export interface Vendor {
  key: string;
  label: string;
  category?: string;
}

export interface CompareCell {
  value: "yes" | "no" | "partial" | "na" | string;
  note?: string;
}

export interface CompareRow {
  criterion: string;
  detail?: string;
  cells: Record<string, CompareCell>;
}
