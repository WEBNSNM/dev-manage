import { socket } from './socket';

/**
 * 通用的 AI 对话函数
 */
export function callKuyepClaude(userContent: string, systemPrompt: string) {
  return new Promise((resolve, reject) => {
    // 发送给后端，让后端去伪装
    socket.emit('proxy:claude', {
      message: userContent, 
      systemPrompt 
    }, (response: any) => {
      // 回调处理
      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}