import React, { useEffect, useRef } from 'react';
import Gantt from 'frappe-gantt';
import 'frappe-gantt/dist/frappe-gantt.css';

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function toFrappeTasks(ganttTasks) {
  const baseDate = new Date();
  return ganttTasks.map((t) => {
    const start = new Date(baseDate);
    start.setDate(start.getDate() + (t.startOffsetDays || 0));
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(t.durationDays || 1, 1));
    return {
      id: t.id,
      name: t.role ? `${t.name}(${t.role})` : t.name,
      start: toDateStr(start),
      end: toDateStr(end),
      progress: 0,
      dependencies: Array.isArray(t.dependsOn) ? t.dependsOn : [],
    };
  });
}

export default function GanttChart({ tasks }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !tasks?.length) return;
    containerRef.current.innerHTML = '';
    new Gantt(containerRef.current, toFrappeTasks(tasks), { view_mode: 'Day' });
  }, [tasks]);

  if (!tasks?.length) return null;
  return <div ref={containerRef} />;
}
