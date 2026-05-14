import { matchTranscriptToScript, buildContextHint } from '../scriptMatcher';
import { flattenLines } from '../scriptUtils';
import type { Play } from '../types';

const samplePlay: Play = {
  id: 'hamlet',
  title: 'Hamlet',
  description: '',
  acts: [
    {
      id: 'act-0',
      order: 0,
      title: 'Act I',
      scenes: [
        {
          id: 'act-0-scene-0',
          order: 0,
          title: 'Scene 1',
          lines: [
            { id: '1', order: 0, text: 'To be or not to be that is the question', character: 'HAMLET', type: 'dialogue' },
            { id: '2', order: 1, text: 'Whether tis nobler in the mind to suffer', character: 'HAMLET', type: 'dialogue' },
            { id: '3', order: 2, text: 'The slings and arrows of outrageous fortune', character: 'HAMLET', type: 'dialogue' },
            { id: '4', order: 3, text: 'Or to take arms against a sea of troubles', character: 'HAMLET', type: 'dialogue' },
            { id: '5', order: 4, text: 'And by opposing end them', character: 'HAMLET', type: 'dialogue' },
            { id: '6', order: 5, text: 'To die to sleep no more', character: 'HAMLET', type: 'dialogue' },
          ],
        },
      ],
    },
  ],
};

describe('matchTranscriptToScript', () => {
  const lines = flattenLines(samplePlay);

  it('returns -1 for empty transcript', () => {
    expect(matchTranscriptToScript('', lines, 0)).toBe(-1);
  });

  it('returns -1 for whitespace-only transcript', () => {
    expect(matchTranscriptToScript('   ', lines, 0)).toBe(-1);
  });

  it('returns -1 for empty lines array', () => {
    expect(matchTranscriptToScript('to be or not to be', [], 0)).toBe(-1);
  });

  it('matches exact line text to its index', () => {
    const idx = matchTranscriptToScript('to be or not to be that is the question', lines, 0);
    expect(idx).toBe(0);
  });

  it('matches a later line when starting from a later index', () => {
    const idx = matchTranscriptToScript('slings and arrows of outrageous fortune', lines, 1);
    expect(idx).toBe(2);
  });

  it('does not look before currentIdx', () => {
    const idx = matchTranscriptToScript('to be or not to be', lines, 3);
    expect(idx).toBe(-1);
  });

  it('respects windowSize and does not match beyond the window', () => {
    const idx = matchTranscriptToScript('to die to sleep no more', lines, 0, 2);
    expect(idx).toBe(-1);
  });

  it('matches with partial text above threshold', () => {
    const idx = matchTranscriptToScript('to take arms against sea of troubles', lines, 0);
    expect(idx).toBe(3);
  });

  it("matches when transcript has extra words before the true line", () => {
    const idx = matchTranscriptToScript(
      "green eyes i already trust this cat",
      [
        ...lines,
        {
          ...lines[0],
          line: {
            ...lines[0].line,
            text: "i already trust this cat",
          },
        },
      ],
      0,
      15,
      0.35,
    );
    expect(idx).toBe(6);
  });

  it('returns -1 when no line exceeds the threshold', () => {
    const idx = matchTranscriptToScript('completely unrelated gibberish xyz', lines, 0);
    expect(idx).toBe(-1);
  });
});

describe('buildContextHint', () => {
  const lines = flattenLines(samplePlay);

  it('returns empty string for empty lines array', () => {
    expect(buildContextHint([], 0)).toBe('');
  });

  it('includes character name and text in output', () => {
    const hint = buildContextHint(lines, 0, 1);
    expect(hint).toContain('HAMLET');
    expect(hint).toContain('To be or not to be');
  });

  it('respects windowSize', () => {
    const hint = buildContextHint(lines, 0, 1);
    const lineCount = hint.split('\n').length;
    expect(lineCount).toBe(2);
  });

  it('clamps to end of lines array', () => {
    const hint = buildContextHint(lines, 4, 10);
    expect(hint).toContain('And by opposing end them');
    expect(hint).toContain('To die to sleep no more');
  });
});
