"use client";

import { useI18n } from "@/i18n/provider";

export function OptionalTag() {
  const { t } = useI18n();
  return <span className="text-xs font-normal text-faint">{t.common.optional}</span>;
}
