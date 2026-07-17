import type { ReelAlbum } from './reelGeometry';

/**
 * One disc = one album, seven slides. Gradients stand in for photos —
 * swap in real artwork by giving each slide a background image instead.
 */
export const ALBUMS: ReelAlbum[] = [
  {
    id: 'summer-99',
    tagline: 'The reel for everything summer',
    title: 'Summer ’99',
    sub: 'seven slides · kodachrome',
    photos: [
      { caption: 'sunrise swim', tint: ['#f6b26b', '#e26d5a'] },
      { caption: 'the boardwalk', tint: ['#f2c14e', '#d1603d'] },
      { caption: 'tide pools', tint: ['#7fc8a9', '#3f7d6a'] },
      { caption: 'ice cream truck', tint: ['#f7d6e0', '#e8788a'] },
      { caption: 'ferris wheel at dusk', tint: ['#c3a6e1', '#6f5aa8'] },
      { caption: 'bonfire', tint: ['#f28f3b', '#a53f2b'] },
      { caption: 'last light', tint: ['#ffd8a8', '#c97b63'] },
    ],
  },
  {
    id: 'road-trip-02',
    tagline: 'The reel for the open road',
    title: 'Road Trip ’02',
    sub: 'seven slides · kodachrome',
    photos: [
      { caption: 'desert highway', tint: ['#e8c07d', '#b06c49'] },
      { caption: 'motel pool', tint: ['#8fd5d0', '#2f7e83'] },
      { caption: 'diner booth', tint: ['#f4a9a8', '#c1666b'] },
      { caption: 'canyon overlook', tint: ['#e3936b', '#8c4a3c'] },
      { caption: 'gas station at dusk', tint: ['#9db4d0', '#4a5f8a'] },
      { caption: 'the drive-in', tint: ['#b6a6ca', '#5d4a7e'] },
      { caption: 'state line', tint: ['#f2d5a0', '#a8845c'] },
    ],
  },
  {
    id: 'christmas-99',
    tagline: 'The reel for Christmas morning',
    title: 'Christmas ’99',
    sub: 'seven slides · kodachrome',
    photos: [
      { caption: 'the tree lot', tint: ['#9fc490', '#3b6844'] },
      { caption: 'grandma’s kitchen', tint: ['#f3c98b', '#b06e3b'] },
      { caption: 'first snow', tint: ['#dbe9f4', '#8fb3d1'] },
      { caption: 'sledding hill', tint: ['#cfe0e8', '#6a93ad'] },
      { caption: 'window lights', tint: ['#f5d491', '#c98a3d'] },
      { caption: 'wrapping paper floor', tint: ['#e89aa4', '#a24a5c'] },
      { caption: 'new pajamas', tint: ['#c9d7f0', '#66799e'] },
    ],
  },
];
