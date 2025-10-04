const appUrl = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export const frameMetadata = {
  version: 'next',
  imageUrl: `${appUrl}/images/feed.png`,
  button: {
    title: 'EmpowerTours',
    action: {
      type: 'launch_frame',
      name: 'EmpowerTours MiniApp',
      url: appUrl,
      splashImageUrl: `${appUrl}/images/splash.png`,
      splashBackgroundColor: '#353B48',
    },
  },
};
