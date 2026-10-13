"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { gsap } from "gsap";
import { MapPin, MessageCircle, Trash2, UserRound } from "lucide-react";
import "./chroma-grid.css";

export type ChromaStaffItem = {
  id: string | number;
  staffCode: string;
  image?: string | null;
  initials: string;
  name: string;
  category: string;
  role: string;
  phone: string;
  address?: string | null;
  active: boolean;
};

export default function ChromaGrid({
  items,
  radius = 260,
  damping = 0.45,
  fadeOut = 0.6,
  onRemove,
}: {
  items: ChromaStaffItem[];
  radius?: number;
  damping?: number;
  fadeOut?: number;
  onRemove?: (id: string | number) => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const [removing, setRemoving] = useState<string | number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    pos.current = { x: bounds.width / 2, y: bounds.height / 2 };
    gsap.set(root, {
      "--x": `${pos.current.x}px`,
      "--y": `${pos.current.y}px`,
    });
    return () => gsap.killTweensOf(pos.current);
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    gsap.to(pos.current, {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      duration: damping,
      ease: "power3.out",
      overwrite: true,
      onUpdate: () => {
        root.style.setProperty("--x", `${pos.current.x}px`);
        root.style.setProperty("--y", `${pos.current.y}px`);
      },
    });
    gsap.to(fadeRef.current, { opacity: 0, duration: 0.25, overwrite: true });
  }

  function moveCard(event: React.MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--mouse-x",
      `${event.clientX - bounds.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--mouse-y",
      `${event.clientY - bounds.top}px`,
    );
  }

  return (
    <div
      ref={rootRef}
      className="chroma-grid"
      style={{ "--r": `${radius}px` } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={() =>
        gsap.to(fadeRef.current, {
          opacity: 1,
          duration: fadeOut,
          overwrite: true,
        })
      }
    >
      {items.map((person, index) => (
        <article
          className={`chroma-card ${!person.active ? "inactive" : ""}`}
          key={person.id}
          onMouseMove={moveCard}
          style={
            {
              "--card-accent": ["#e49b3f", "#3f8c63", "#ae6b50"][index % 3],
            } as CSSProperties
          }
        >
          <div className="chroma-photo">
            {person.image ? (
              <img
                src={person.image}
                alt={`${person.name}, ${person.category}`}
              />
            ) : (
              <span aria-hidden="true">{person.initials}</span>
            )}
            <span className="staff-id">{person.staffCode}</span>
          </div>
          <div className="chroma-info">
            <div>
              <h3>{person.name}</h3>
              <p>{person.role}</p>
            </div>
            <span className="category-pill">{person.category}</span>
            <div className="staff-contact">
              <span>
                <MessageCircle size={14} aria-hidden="true" />
                {person.phone}
              </span>
              {person.address && (
                <span>
                  <MapPin size={14} aria-hidden="true" />
                  {person.address}
                </span>
              )}
              {!person.address && (
                <span className="optional-empty">
                  <UserRound size={14} aria-hidden="true" /> No address added
                </span>
              )}
            </div>
            {onRemove && (
              <button
                className="staff-remove"
                type="button"
                disabled={removing === person.id}
                onClick={async () => {
                  setRemoving(person.id);
                  try {
                    await onRemove(person.id);
                  } finally {
                    setRemoving(null);
                  }
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
                {removing === person.id ? "Removing…" : "Remove staff"}
              </button>
            )}
          </div>
        </article>
      ))}
      <div className="chroma-overlay" aria-hidden="true" />
      <div ref={fadeRef} className="chroma-fade" aria-hidden="true" />
    </div>
  );
}
