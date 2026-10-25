import { describe, expect, it } from 'vitest';
import { getYouTubeVideoIds } from './youtube';

describe('GameBanana YouTube media', () => {
  it.each([
    'https://www.youtube.com/watch?v=qOwaOVo5lmw',
    'https://www.youtube.com/watch?v=qOwaOVo5lmw&t=3s',
    'https://youtu.be/qOwaOVo5lmw?si=share',
    'https://m.youtube.com/watch?v=qOwaOVo5lmw',
    'https://www.youtube.com/embed/qOwaOVo5lmw',
    'https://www.youtube-nocookie.com/embed/qOwaOVo5lmw',
    'https://www.youtube.com/shorts/qOwaOVo5lmw',
    'https://www.youtube.com/live/qOwaOVo5lmw/',
  ])('reads the video ID from %s', link => {
    expect(getYouTubeVideoIds([link])).toEqual(['qOwaOVo5lmw']);
  });

  it.each([
    'https://youtube.com.evil.test/watch?v=qOwaOVo5lmw',
    'https://www.youtube.com@evil.test/watch?v=qOwaOVo5lmw',
    'https://user:pass@www.youtube.com/watch?v=qOwaOVo5lmw',
    'https://www.youtube.com:9000/watch?v=qOwaOVo5lmw',
    'https://www.youtube.com/playlist?list=qOwaOVo5lmw',
    'https://www.youtube.com/watch?v=invalid',
    'https://www.youtube.com/embed/qOwaOVo5lmw/other',
    'https://vimeo.com/12345678901',
    'javascript:alert(1)',
    'not a URL',
  ])('ignores unsupported media: %s', link => {
    expect(getYouTubeVideoIds([link])).toEqual([]);
  });

  it('deduplicates videos while retaining their original order', () => {
    expect(getYouTubeVideoIds([
      'https://www.youtube.com/watch?v=qOwaOVo5lmw',
      'https://www.youtube.com/watch?v=AJKwHiwLp28&t=3s',
      'https://youtu.be/qOwaOVo5lmw',
    ])).toEqual(['qOwaOVo5lmw', 'AJKwHiwLp28']);
    expect(getYouTubeVideoIds()).toEqual([]);
    expect(getYouTubeVideoIds(null)).toEqual([]);
  });
});
