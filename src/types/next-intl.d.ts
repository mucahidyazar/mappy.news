import type messages from "../../messages/tr.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
