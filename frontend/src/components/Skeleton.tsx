interface SkeletonProps {
  height?: number;
  width?: string | number;
  style?: React.CSSProperties;
}

export function Skeleton({ height = 16, width = "100%", style }: SkeletonProps) {
  return <div className="rh-skeleton" style={{ height, width, ...style }} />;
}
