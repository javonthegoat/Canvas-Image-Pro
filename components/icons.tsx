

import React from 'react';

const Icon: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const EyeIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Icon>
);

export const EyeOffIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></Icon>
);

export const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Icon>
);

export const UnlockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></Icon>
);

export const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Icon>
);

export const ZoomInIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
);

export const ZoomOutIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
);

export const RotateCwIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></Icon>
);

export const ScaleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M21 21l-6-6m6 6v-4.8m0 4.8h-4.8" /><path d="M3 16.2V21h4.8" /><path d="M3 3h18v18H3z" /></Icon>
);

export const CropIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" /><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" /></Icon>
);

export const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>
);

export const MousePointerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></Icon>
);

export const PenToolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /></Icon>
);

export const TypeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></Icon>
);

export const SquareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></Icon>
);

export const CircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><circle cx="12" cy="12" r="10" /></Icon>
);

export const ArrowIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Icon>
);

export const LineIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><line x1="5" y1="19" x2="19" y2="5" /></Icon>
);

export const EyedropperIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><path d="M18.207 4.793a3 3 0 0 0-4.242 0l-9.251 9.251a1 1 0 0 0 0 1.414l2.829 2.829a1 1 0 0 0 1.414 0l9.25-9.25a3 3 0 0 0 0-4.243zM7.5 16.5l-5-5" /><path d="M13.5 10.5l-5-5" /></Icon>
);

export const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></Icon>
);

export const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
);

export const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>
);

export const DuplicateIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);

export const PencilIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></Icon>
);

export const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="6 9 12 15 18 9" /></Icon>
);

export const ChevronUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="18 15 12 9 6 15" /></Icon>
);

export const ChevronsDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></Icon>
);

export const ChevronsUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></Icon>
);

export const SendToBackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><rect x="5" y="4" width="10" height="10" rx="2" /><path d="M15 4v8h-8M19 8v8h-8" /></Icon>
);

export const BringToFrontIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><rect x="9" y="10" width="10" height="10" rx="2" /><path d="M9 16V8h8M5 12V4h8" /></Icon>
);

export const RedoIcon: React.FC<{ className?: string }> = RotateCwIcon;

export const UndoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <RotateCwIcon className={`-scale-x-100 ${className || ''}`} />
);

export const AlignLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="3" y1="21" x2="3" y2="3" /><rect x="7" y="6" width="8" height="5" rx="1" /><rect x="7" y="13" width="12" height="5" rx="1" /></Icon>
);
export const AlignHorizontalCenterIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="12" y1="21" x2="12" y2="3" /><rect x="8" y="6" width="8" height="5" rx="1" /><rect x="6" y="13" width="12" height="5" rx="1" /></Icon>
);
export const AlignRightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="21" y1="21" x2="21" y2="3" /><rect x="9" y="6" width="8" height="5" rx="1" /><rect x="5" y="13" width="12" height="5" rx="1" /></Icon>
);
export const AlignTopIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="3" y1="3" x2="21" y2="3" /><rect x="6" y="7" width="5" height="8" rx="1" /><rect x="13" y="7" width="5" height="12" rx="1" /></Icon>
);
export const AlignVerticalCenterIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="3" y1="12" x2="21" y2="12" /><rect x="6" y="8" width="5" height="8" rx="1" /><rect x="13" y="6" width="5" height="12" rx="1" /></Icon>
);
export const AlignBottomIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><line x1="3" y1="21" x2="21" y2="21" /><rect x="6" y="11" width="5" height="8" rx="1" /><rect x="13" y="6" width="5" height="12" rx="1" /></Icon>
);
export const ArrangeHorizontalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="3" y="8" width="5" height="8" rx="1" /><rect x="9.5" y="8" width="5" height="8" rx="1" /><rect x="16" y="8" width="5" height="8" rx="1" /></Icon>
);
export const ArrangeVerticalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="8" y="3" width="8" height="5" rx="1" /><rect x="8" y="9.5" width="8" height="5" rx="1" /><rect x="8" y="16" width="8" height="5" rx="1" /></Icon>
);

export const StackHorizontalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
        <rect x="2" y="7" width="4" height="10" rx="1" />
        <rect x="7" y="7" width="4" height="10" rx="1" />
        <rect x="12" y="7" width="4" height="10" rx="1" />
        <rect x="17" y="7" width="4" height="10" rx="1" />
    </Icon>
);

export const StackVerticalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
        <rect x="7" y="2" width="10" height="4" rx="1" />
        <rect x="7" y="7" width="10" height="4" rx="1" />
        <rect x="7" y="12" width="10" height="4" rx="1" />
        <rect x="7" y="17" width="10" height="4" rx="1" />
    </Icon>
);

export const DistributeHorizontalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
      <path d="M15 5H9a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="M5 5H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
      <path d="M20 5h-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
    </Icon>
);
export const DistributeVerticalIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
        <path d="M5 15v-6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1-1H6a1 1 0 0 1-1-1z" />
        <path d="M5 5V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1a1 1 0 0 1-1-1H6a1 1 0 0 1-1-1z" />
        <path d="M5 20v-1a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1a1 1 0 0 1-1-1H6a1 1 0 0 1-1-1z" />
    </Icon>
);
export const MatchWidthIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="3" y="3" width="8" height="18" rx="1" /><rect x="13" y="7" width="8" height="10" rx="1" /></Icon>
);
export const MatchHeightIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><rect x="3" y="3" width="18" height="8" rx="1" /><rect x="7" y="13" width="10" height="8" rx="1" /></Icon>
);

export const MaximizeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Icon>
);

export const SaveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </Icon>
);

export const FolderOpenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Icon>
);

export const LayersIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></Icon>
);

export const SlidersIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Icon>
);

export const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>
);

export const ChevronsUpDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></Icon>
);

export const TagIcon: React.FC<{ className?: string }> = ({ className }) => (
    <Icon className={className}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></Icon>
);

export const SortAscendingIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <path d="M3 12h4" />
    <path d="M3 6h10" />
    <path d="M3 18h6" />
    <path d="m21 9-3-3-3 3" />
    <path d="M18 18V6" />
  </Icon>
);

export const SortDescendingIcon: React.FC<{ className?: string }> = ({ className }) => (
  <Icon className={className}>
    <path d="M3 12h4" />
    <path d="M3 6h10" />
    <path d="M3 18h6" />
    <path d="m21 15-3 3-3-3" />
    <path d="M18 6v12" />
  </Icon>
);