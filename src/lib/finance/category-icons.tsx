import {
  Apple,
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Baby,
  Backpack,
  Banknote,
  BedDouble,
  Beef,
  Beer,
  Bike,
  Blocks,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Cake,
  Calculator,
  Camera,
  Car,
  Carrot,
  Cat,
  Cigarette,
  Clapperboard,
  Clock,
  Cloud,
  Coffee,
  Coins,
  Cookie,
  CreditCard,
  Croissant,
  Dices,
  Dog,
  Droplet,
  Dumbbell,
  Egg,
  Flame,
  Flower2,
  Footprints,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  GraduationCap,
  Hammer,
  HandCoins,
  HeartHandshake,
  HeartPulse,
  Headphones,
  Home,
  IceCreamCone,
  Key,
  Landmark,
  Lightbulb,
  Luggage,
  MapPin,
  Milk,
  Newspaper,
  Palmtree,
  ParkingCircle,
  PartyPopper,
  PawPrint,
  Pill,
  Pizza,
  Plane,
  QrCode,
  Receipt,
  Repeat,
  Salad,
  Sandwich,
  Scale,
  Scissors,
  School,
  Shield,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Smile,
  Sofa,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Trees,
  Tv,
  UserRound,
  Users,
  UtensilsCrossed,
  Volleyball,
  Wallet,
  Watch,
  Waves,
  Wifi,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  // Original set — mantido como está para não quebrar categorias que já
  // usam esses valores.
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

  // Alimentação, mais específicos
  { value: "supermarket", label: "Supermercado", icon: ShoppingCart },
  { value: "produce", label: "Hortifruti", icon: Carrot },
  { value: "fruit", label: "Frutas", icon: Apple },
  { value: "bakery", label: "Padaria", icon: Croissant },
  { value: "coffee", label: "Café", icon: Coffee },
  { value: "drinks", label: "Bebidas", icon: Wine },

  // Moradia / contas da casa
  { value: "electricity", label: "Energia/Luz", icon: Lightbulb },
  { value: "water", label: "Água", icon: Droplet },
  { value: "gas", label: "Gás", icon: Flame },
  { value: "internet", label: "Internet", icon: Wifi },
  { value: "condo", label: "Condomínio", icon: Building2 },
  { value: "furniture", label: "Móveis", icon: Sofa },
  { value: "renovation", label: "Reforma", icon: Hammer },

  // Transporte
  { value: "fuel", label: "Combustível", icon: Fuel },
  { value: "public_transport", label: "Transporte público", icon: Bus },
  { value: "parking", label: "Estacionamento", icon: ParkingCircle },

  // Saúde
  { value: "pharmacy", label: "Farmácia", icon: Pill },
  { value: "doctor", label: "Médico", icon: Stethoscope },
  { value: "dentist", label: "Dentista", icon: Smile },
  { value: "gym", label: "Academia", icon: Dumbbell },

  // Lazer / esportes
  { value: "sports", label: "Atividades esportivas", icon: Volleyball },
  { value: "movies", label: "Cinema", icon: Clapperboard },
  { value: "streaming", label: "Streaming", icon: Tv },
  { value: "music", label: "Música", icon: Headphones },

  // Educação
  { value: "school", label: "Escola", icon: School },
  { value: "books", label: "Livros", icon: BookOpen },
  { value: "school_supplies", label: "Material escolar", icon: Backpack },
  { value: "kids_activities", label: "Atividades para crianças", icon: Blocks },

  // Compras
  { value: "gifts", label: "Presentes", icon: Gift },

  // Finanças
  { value: "savings", label: "Poupança", icon: Landmark },
  { value: "coins", label: "Dinheiro/Troco", icon: Coins },
  { value: "taxes", label: "Impostos/Taxas", icon: Receipt },

  // Serviços
  { value: "beauty", label: "Beleza", icon: Scissors },
  { value: "cleaning", label: "Limpeza", icon: Sparkles },
  { value: "cloud_storage", label: "Armazenamento em nuvem", icon: Cloud },

  // Viagem
  { value: "luggage", label: "Bagagem", icon: Luggage },
  { value: "lodging", label: "Hospedagem", icon: BedDouble },
  { value: "tourism", label: "Turismo", icon: MapPin },
  { value: "vacation", label: "Férias", icon: Palmtree },

  // Pets
  { value: "cats", label: "Gatos", icon: Cat },
  { value: "pet_care", label: "Cuidados com pets", icon: PawPrint },

  // Alimentação, ainda mais específicos
  { value: "meat", label: "Carne", icon: Beef },
  { value: "eggs", label: "Ovos", icon: Egg },
  { value: "dairy", label: "Laticínios", icon: Milk },
  { value: "fastfood", label: "Fast food", icon: Pizza },
  { value: "snacks", label: "Lanches", icon: Sandwich },
  { value: "dessert", label: "Sobremesa", icon: IceCreamCone },
  { value: "sweets", label: "Doces", icon: Cookie },
  { value: "healthy_food", label: "Comida saudável", icon: Salad },
  { value: "beer", label: "Cerveja", icon: Beer },

  // Vestuário
  { value: "clothing", label: "Vestuário", icon: Shirt },
  { value: "shoes", label: "Calçados", icon: Footprints },
  { value: "accessories", label: "Acessórios", icon: Watch },
  { value: "glasses", label: "Óculos", icon: Glasses },
  { value: "jewelry", label: "Joias", icon: Gem },

  // Transporte, mais específicos
  { value: "bike", label: "Bicicleta", icon: Bike },

  // Seguros e proteção
  { value: "insurance", label: "Seguro", icon: Shield },
  { value: "security", label: "Segurança", icon: ShieldCheck },

  // Finanças, mais específicos
  { value: "credit_card", label: "Cartão de crédito", icon: CreditCard },
  { value: "pix", label: "Pix", icon: QrCode },
  { value: "accounting", label: "Contabilidade", icon: Calculator },
  { value: "legal", label: "Jurídico", icon: Scale },

  // Lazer, mais específicos
  { value: "games", label: "Jogos", icon: Dices },
  { value: "party", label: "Festa", icon: PartyPopper },
  { value: "birthday", label: "Aniversário", icon: Cake },
  { value: "reading", label: "Leitura/Revistas", icon: Newspaper },
  { value: "photography", label: "Fotografia", icon: Camera },

  // Casa e jardim
  { value: "garden", label: "Jardim", icon: Flower2 },
  { value: "outdoors", label: "Área externa", icon: Trees },
  { value: "pool", label: "Piscina", icon: Waves },

  // Funcionários domésticos e trabalho
  { value: "staff", label: "Funcionários", icon: Users },
  { value: "domestic_worker", label: "Empregada doméstica", icon: UserRound },
  { value: "overtime", label: "Hora extra", icon: Clock },
  { value: "payroll", label: "Folha de pagamento", icon: HandCoins },
  { value: "job", label: "Trabalho/Emprego", icon: Briefcase },

  // Diversos
  { value: "donation", label: "Doações", icon: HeartHandshake },
  { value: "smoking", label: "Tabaco", icon: Cigarette },
  { value: "rent_keys", label: "Aluguel/Chaves", icon: Key },
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
