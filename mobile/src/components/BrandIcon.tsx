import { Image } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { theme } from "../theme";

// The assets use the same 24-point paths as the web icons. Metro requires static asset paths.
const icons = {
  ticket: require("../../assets/icons/ticket.png"),
  calendar: require("../../assets/icons/calendar.png"),
  chat: require("../../assets/icons/chat.png"),
  bell: require("../../assets/icons/bell.png"),
  grid: require("../../assets/icons/grid.png"),
  scan: require("../../assets/icons/scan.png"),
  search: require("../../assets/icons/search.png"),
  pin: require("../../assets/icons/pin.png"),
  qr: require("../../assets/icons/qr.png"),
  arrow: require("../../assets/icons/arrow.png"),
} satisfies Record<string, ImageSourcePropType>;

export type BrandIconName = keyof typeof icons;

export function BrandIcon({ name, color = theme.colors.primary, size = 22 }: {
  name: BrandIconName;
  color?: string;
  size?: number;
}) {
  return <Image source={icons[name]} accessible={false} style={{ width: size, height: size, tintColor: color }} />;
}
