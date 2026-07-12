import { ShiftRecord } from "../../types";

export interface ShiftViewActions {
  onOpen: (shift: ShiftRecord) => void;
  onEdit?: (shift: ShiftRecord) => void;
  onDuplicate?: (shift: ShiftRecord) => void;
  onShare?: (shift: ShiftRecord) => void;
  onDelete?: (shift: ShiftRecord) => void;
  onTogglePublish?: (shift: ShiftRecord) => void;
}
