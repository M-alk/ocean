// Small line icons in the spirit of Notion's UI.
const P = {
  page: <path d="M4.5 2.5h5l3 3v8h-8z M9.5 2.5v3h3" />,
  folder: <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  plus: <path d="M8 3v10M3 8h10" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />,
  search: <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6L14 14" />,
  edit: <path d="M3 13h3l7-7-3-3-7 7zM9 4l3 3" />,
  collapse: <path d="M10 4L6 8l4 4M3 2.5v11" />,
  menu: <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth="2.4" />,
  slides: <path d="M2.5 3h11v8h-11zM8 11v2.5M5.5 13.5h5" />,
  copy: <path d="M5.5 5.5h7v8h-7zM3.5 10.5v-8h7" />,
  smile: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6 6.5h.01M10 6.5h.01M5.5 9.5c1.3 1.5 3.7 1.5 5 0" />,
  bolt: <path d="M9 1.8L3.5 9h4l-1 5.2L12.5 7h-4z" />,
  home: <path d="M2.5 7.5 8 3l5.5 4.5V13H9.5V9.5h-3V13H2.5z" fill="currentColor" stroke="none" />,
  star: <path d="M8 2.2l1.75 3.6 3.95.55-2.85 2.8.7 3.9L8 11.2l-3.55 1.85.7-3.9L2.3 6.35l3.95-.55z" />,
  starFill: <path d="M8 2.2l1.75 3.6 3.95.55-2.85 2.8.7 3.9L8 11.2l-3.55 1.85.7-3.9L2.3 6.35l3.95-.55z" fill="currentColor" />,
  link: <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.1-2.1a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.4 8.9a2.6 2.6 0 0 0 3.7 3.7l.6-.6" />,
  help: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.3 6.3a1.8 1.8 0 1 1 2.5 1.6c-.5.2-.8.6-.8 1.1v.4M8 11.3h.01" />,
  down: <path d="M4.5 6.5 8 10l3.5-3.5" />,
  arrowLeft: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  arrowRight: <path d="M6 3.5 10.5 8 6 12.5" />,
  clock: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.8V8l2.2 1.4" />,
  expand: <path d="M3 6.5V3h3.5M13 9.5V13H9.5M9.5 3H13v3.5M6.5 13H3V9.5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  download: <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 12.5v1h10v-1" />,
  image: <path d="M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M10.5 6.3h.01" />,
  imageOff: <path d="M2.5 3.5h11v9h-11zM2.5 10.5l3-3 3 3 2-2 3 3M2 2l12 12" />,
  graph: (
    <>
      <circle cx="4" cy="4.5" r="1.6" />
      <circle cx="12" cy="3.5" r="1.6" />
      <circle cx="8" cy="12.5" r="1.6" />
      <path d="M5.6 4.3l4.8-.6M4.8 5.9l2.4 5M11.3 5l-2.5 5.9" />
    </>
  ),
  book: <path d="M3 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 0 7 12H3zM13 3.5H9.5A1.5 1.5 0 0 0 8 5v8.5A1.5 1.5 0 0 1 9.5 12H13z" />,
  lock: <path d="M4.5 7.5h7v6h-7zM5.8 7.5V5.3a2.2 2.2 0 0 1 4.4 0v2.2" />,
  sidebar: <path d="M2.5 3h11v10h-11zM6.5 3v10" />,
};

export function Icon({ name, size = 16 }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
