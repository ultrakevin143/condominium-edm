import * as React from "react";
export function Table(props: React.ComponentProps<"table">) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Scrollable data table"
    >
      <table {...props} />
    </div>
  );
}
