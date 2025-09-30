import { SafeAreaInsets } from '@/types';

interface Props {
  children: React.ReactNode;
  insets?: SafeAreaInsets;
}

export default function SafeAreaContainer({ children, insets = { top: 0, bottom: 0, left: 0, right: 0 } }: Props) {
  return (
    <div style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      {children}
    </div>
  );
}
