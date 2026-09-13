"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";

export interface WarehouseLetterhead {
  name: string;
  address: string | null;
  phone: string | null;
  ntn: string | null;
  logoUrl: string | null;
  currency: string;
}

export function useLetterhead(): WarehouseLetterhead | null {
  const [data, setData] = useState<WarehouseLetterhead | null>(null);
  useEffect(() => {
    authFetch<WarehouseLetterhead>("/warehouse/letterhead")
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data;
}

export function Letterhead({
  warehouse,
  title,
  subtitle,
  period,
  page,
}: {
  warehouse: WarehouseLetterhead | null;
  title: string;
  subtitle?: string;
  period?: string;
  page?: string;
}) {
  const now = new Date();
  const contactLine = [warehouse?.address, warehouse?.phone].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="letterhead-top">
        <div className="letterhead-brand">
          {warehouse?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={warehouse.logoUrl} alt="" className="letterhead-logo" />
          )}
          <div>
            <div className="letterhead-name">{warehouse?.name ?? "—"}</div>
            {contactLine && <div className="letterhead-meta">{contactLine}</div>}
            {warehouse?.ntn && <div className="letterhead-meta">NTN: {warehouse.ntn}</div>}
          </div>
        </div>
        <div className="letterhead-printed">
          Printed: {formatDate(now)}
          <br />
          {formatTime(now)}
        </div>
      </div>
      <div className="rule-heavy" />
      <div className="letterhead-title-row">
        <div>
          <div className="letterhead-title">{title}</div>
          {subtitle && <div className="letterhead-subtitle">{subtitle}</div>}
          {period && <div className="letterhead-period">{period}</div>}
        </div>
        {page && <div className="letterhead-page">{page}</div>}
      </div>
      <div className="rule-heavy" />
    </div>
  );
}
