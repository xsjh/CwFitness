import type { NextConfig } from "next";

// The development indicator renders in a portal at the bottom-left corner by default. The
// authenticated workspace docks its navigation to the bottom of the viewport on small
// screens, so the indicator sits on top of the "今日" control and swallows the click. Test
// runs turn it off; ordinary `next dev` keeps it.
const nextConfig: NextConfig = {
  devIndicators: process.env.CWFITNESS_DEV_INDICATOR === "off" ? false : undefined,
};

export default nextConfig;
