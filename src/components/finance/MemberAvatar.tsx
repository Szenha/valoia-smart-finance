import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsFor } from "@/lib/finance/member-visuals";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  color: string;
  size?: "sm" | "md";
  className?: string;
};

export function MemberAvatar({ name, color, size = "sm", className }: Props) {
  return (
    <Avatar className={cn(size === "sm" ? "h-6 w-6" : "h-9 w-9", className)}>
      <AvatarFallback
        className={cn("font-semibold text-white", size === "sm" ? "text-[10px]" : "text-xs")}
        style={{ backgroundColor: color }}
      >
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  );
}
