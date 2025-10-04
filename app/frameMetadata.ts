const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
export const frameMetadata = {
  version: '1',
  imageUrl: `${appUrl}/images/og-image.png`,
  button: {
    title: 'Launch EmpowerTours',
    action: {
      type: 'launch_miniapp',
      name: 'EmpowerTours MiniApp',
      url: appUrl,
      splashImageUrl: `${appUrl}/images/splash.png`,
      splashBackgroundColor: '#353B48',
    },
  },
};
