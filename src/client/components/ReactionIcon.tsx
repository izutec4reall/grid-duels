import {
  Flame,
  Frown,
  Handshake,
  Heart,
  Laugh,
  PartyPopper,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import type { Reaction } from "@/lib/reactions";

const ICONS: Record<Reaction, LucideIcon> = {
  "thumbs-up": ThumbsUp,
  heart: Heart,
  laugh: Laugh,
  party: PartyPopper,
  fire: Flame,
  handshake: Handshake,
  sad: Frown,
};

export function ReactionIcon({
  reaction,
  className,
}: {
  reaction: Reaction;
  className?: string;
}) {
  const Icon = ICONS[reaction] ?? ThumbsUp;
  return <Icon className={className} aria-hidden />;
}
