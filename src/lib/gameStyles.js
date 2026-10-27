// src/lib/gameStyles.js
//
// Đăng ký các PHONG CÁCH game giáo dục. Mỗi lần bấm "Tạo phiên bản mới",
// server chọn một style khác các phiên bản đã có (xem api/learning-game.js),
// nên mỗi Version 1, 2, 3... là một kiểu chơi hoàn toàn khác nhau — cùng tinh
// thần "mỗi lần tạo là một app tương tác khác" của công cụ cũ, nhưng dùng
// template khuôn mẫu nên game luôn chạy được, không phụ thuộc AI viết JS/HTML
// tự do (tránh bug cắt cụt/JS lỗi).
//
// Dùng chung cho: API client (nhãn hiển thị), render HTML, và UI version list.

export const GAME_STYLES = [
  {
    id: 'quiz',
    emoji: '🎯',
    label: 'Trắc nghiệm',
    description: 'Câu hỏi 4 đáp án với giải thích ngay sau mỗi lượt trả lời',
    // Màu nhấn riêng cho từng style để mỗi phiên bản có "không khí" khác hẳn.
    accent: '#7a8a6b',
  },
  {
    id: 'truefalse',
    emoji: '⚖️',
    label: 'Đúng hay Sai',
    description: 'Phán đoán các nhận định từ video và kỷ niệm',
    accent: '#c08a3e',
  },
  {
    id: 'matching',
    emoji: '🧩',
    label: 'Ghép cặp',
    description: 'Nối khái niệm với định nghĩa/ý nghĩa tương ứng',
    accent: '#5b7bb4',
  },
  {
    id: 'flashcards',
    emoji: '🃏',
    label: 'Thẻ ghi nhớ',
    description: 'Lật thẻ học nhanh, tự đánh giá đã nhớ hay cần ôn lại',
    accent: '#b4687a',
  },
  {
    id: 'scenario',
    emoji: '🧭',
    label: 'Tình huống',
    description: 'Đưa ra quyết định trong các tình huống mô phỏng',
    accent: '#4e8f86',
  },
];

export const GAME_STYLE_IDS = GAME_STYLES.map((s) => s.id);

export function getGameStyle(id) {
  return GAME_STYLES.find((s) => s.id === id) || GAME_STYLES[0];
}

export function gameStyleLabel(id) {
  const style = getGameStyle(id);
  return `${style.emoji} ${style.label}`;
}
