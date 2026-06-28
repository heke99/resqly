import { DEFAULT_THEME_TOKENS } from "@resqly/white-label";

/**
 * White-label palette for the mobile app. In production these tokens are fetched
 * for the customer's connected insurance tenant; here we expose the defaults.
 */
export const palette = {
  primary: DEFAULT_THEME_TOKENS.color_primary,
  onPrimary: DEFAULT_THEME_TOKENS.color_on_primary,
  background: DEFAULT_THEME_TOKENS.color_background,
  surface: DEFAULT_THEME_TOKENS.color_surface,
  text: DEFAULT_THEME_TOKENS.color_text,
};
