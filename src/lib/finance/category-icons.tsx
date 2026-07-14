import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Baby,
  Banknote,
  Car,
  Dog,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Plane,
  Repeat,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "food", label: "Alimentação", icon: UtensilsCrossed },
  { value: "transport", label: "Transporte", icon: Car },
  { value: "home", label: "Moradia", icon: Home },
  { value: "health", label: "Saúde", icon: HeartPulse },
  { value: "leisure", label: "Lazer", icon: Gamepad2 },
  { value: "education", label: "Educação", icon: GraduationCap },
  { value: "shopping", label: "Compras", icon: ShoppingBag },
  { value: "salary", label: "Salário", icon: Banknote },
  { value: "investment", label: "Investimentos", icon: TrendingUp },
  { value: "subscription", label: "Assinaturas", icon: Repeat },
  { value: "travel", label: "Viagem", icon: Plane },
  { value: "pets", label: "Pets", icon: Dog },
  { value: "kids", label: "Filhos", icon: Baby },
  { value: "services", label: "Serviços", icon: Wrench },
  { value: "tech", label: "Tecnologia", icon: Smartphone },
  { value: "other", label: "Outros", icon: Wallet },
];

const ICON_BY_VALUE = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.value, option.icon]));

// Used when a category has no icon set yet — one generic mark per transaction type
// so the UI never shows a blank slot.
const FALLBACK_ICON_BY_TYPE: Record<string, LucideIcon> = {
  expense: ArrowDownCircle,
  income: ArrowUpCircle,
  transfer: ArrowLeftRight,
};

export function categoryIconFor(icon: string | null | undefined, type: string): LucideIcon {
  if (icon && ICON_BY_VALUE.has(icon)) return ICON_BY_VALUE.get(icon)!;
  return FALLBACK_ICON_BY_TYPE[type] ?? Wallet;
}
