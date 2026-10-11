"use client";

import { useEffect, useState } from "react";

export default function SessionExpiredNotice({
  explicit,
}: {
  explicit: boolean;
}) {
  const [expired, setExpired] = useState(explicit);

  useEffect(() => {
    if (!explicit && localStorage.getItem("gb_authenticated") === "true") {
      localStorage.removeItem("gb_authenticated");
      setExpired(true);
    }
  }, [explicit]);

  if (!expired) return null;
  return (
    <div className="error" role="alert">
      Your login session expired. Please sign in with Google again.
    </div>
  );
}
