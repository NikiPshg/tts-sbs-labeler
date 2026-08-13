import type { LabelingTask } from './types'

export const demoProject = 'Демо · русский голос'

export const demoTasks: LabelingTask[] = [
  {
    id: 'sbs-001',
    type: 'pairwise',
    text: 'Через несколько минут поезд отправится с третьей платформы.',
    question: 'Какой вариант звучит естественнее?',
    hint: 'Оценивайте интонацию, произношение и отсутствие артефактов.',
    audioA: { src: './audio/sample-a.wav', label: 'Модель A' },
    audioB: { src: './audio/sample-b.wav', label: 'Модель B' },
  },
  {
    id: 'bool-001',
    type: 'boolean',
    text: 'Ты уже отправил финальную версию?',
    question: 'Есть ли здесь вопросительная интонация?',
    hint: 'Оценивайте только интонацию, не содержание текста.',
    audio: { src: './audio/sample-question.wav', label: 'Аудио' },
  },
  {
    id: 'sbs-002',
    type: 'pairwise',
    text: 'Сегодня воздух особенно прозрачный, а город кажется совсем тихим.',
    question: 'Какой вариант вы бы оставили в датасете?',
    audioA: { src: './audio/sample-b.wav', label: 'Модель A' },
    audioB: { src: './audio/sample-a.wav', label: 'Модель B' },
  },
  {
    id: 'bool-002',
    type: 'boolean',
    text: 'Какая неожиданная встреча!',
    question: 'Слышна ли эмоциональная окраска?',
    audio: { src: './audio/sample-b.wav', label: 'Аудио' },
  },
  {
    id: 'sbs-003',
    type: 'pairwise',
    text: 'Пожалуйста, проверьте адрес перед отправкой заказа.',
    audioA: { src: './audio/sample-a.wav', label: 'Модель A' },
    audioB: { src: './audio/sample-question.wav', label: 'Модель B' },
  },
]
