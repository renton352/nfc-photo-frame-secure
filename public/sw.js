// �I�t���C���@�\�Ȃ��B�X�V�̑������f�ƃN���C�A���g�����p�������s���B
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// fetch �͉���肵�Ȃ��i�u���E�U/�T�[�o�[�̃w�b�_�[��������̂܂ܓK�p�j
// �������������^�C���L���b�V��������ꍇ�͂����ɒǉ�����B
