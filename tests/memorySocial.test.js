import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemoryCopy } from '../src/lib/memorySocial.js';

const source = {
  id: 'original', userId: 'alice', title: 'Đà Lạt', story: 'Câu chuyện',
  location: { lat: 11, lng: 108 }, imageData: 'data:image/png;base64,abc',
  learningGameVersions: [{ id: 'v1', spec: { gameTitle: 'One' } }, { id: 'v2', spec: { gameTitle: 'Two' } }],
  createdAt: 'old', reactions: 100, sourceMemoryId: 'ancestor',
};
for (const kind of ['fork', 'remix']) {
  test(`${kind}: new ownership, immediate attribution, complete content, no social metadata`, () => {
    const copy = buildMemoryCopy(source, 'bob', kind);
    assert.equal(copy.userId, 'bob');
    assert.equal(copy.sourceMemoryId, 'original');
    assert.equal(copy.sourceUserId, 'alice');
    assert.equal(copy.derivationType, kind);
    assert.deepEqual(copy.learningGameVersions, source.learningGameVersions);
    assert.equal(copy.story, source.story);
    assert.equal(copy.imageData, source.imageData);
    assert.equal(copy.createdAt, undefined);
    assert.equal(copy.reactions, undefined);
    assert.equal(copy.id, undefined);
    assert.equal(source.userId, 'alice');
    assert.equal(source.title, 'Đà Lạt');
  });
}
test('legacy game and empty optional fields survive copying', () => {
  const copy = buildMemoryCopy({ id: 'old', learningGame: { gameTitle: 'Legacy' }, videoUrl: null }, 'bob', 'fork');
  assert.equal(copy.learningGame.gameTitle, 'Legacy');
  assert.equal(copy.videoUrl, null);
  assert.equal(copy.sourceUserId, null);
});
test('reject anonymous copies and invalid operation', () => {
  assert.throws(() => buildMemoryCopy(source, '', 'fork'));
  assert.throws(() => buildMemoryCopy(source, 'bob', 'edit'));
});
