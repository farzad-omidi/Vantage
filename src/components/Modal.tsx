"use client";

import { type ReactNode } from "react";
import { XIcon } from "@/components/icons";

export function Modal({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 18, 25, 0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px",
        zIndex: 100,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: width, boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="row"
          style={{ justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}
        >
          <h2 style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
