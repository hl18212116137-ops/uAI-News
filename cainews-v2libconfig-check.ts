/**
 * 配置验证工具
 * 检查必需的环境变量是否已配置
 */

export interface ConfigCheckResult {
  isValid: boolean;
  missingKeys: string[];
  message: string;
}

/**
 * 检查 TwitterAPI.io API key 是否已配置
 */
export function checkTwitterApiKey(): ConfigCheckResult {
  const apiKey = process.env.TWITTERAPI_IO_KEY;

  if (!apiKey || apiKey === 'your_twitterapi_io_key_here') {
    return {
      isValid: false,
      missingKeys: ['TWITTERAPI_IO_KEY'],
      message: 'TwitterAPI.io API key 未配置。请在 .env.local 文件中设置 TWITTERAPI_IO_KEY。获取地址: https://twitterapi.io',
    };
  }

  return {
    isValid: true,
    missingKeys: [],
    message: 'TwitterAPI.io API key 已配置',
  };
}

/**
 * 检查 Anthropic API key 是否已配置
 */
export function checkAnthropicApiKey(): ConfigCheckResult {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return {
      isValid: false,
      missingKeys: ['ANTHROPIC_API_KEY'],
      message: 'Anthropic API key 未配置。请在 .env.local 文件中设置 ANTHROPIC_API_KEY。获取地址: https://console.anthropic.com',
    };
  }

  return {
    isValid: true,
    missingKeys: [],
    message: 'Anthropic API key 已配置',
  };
}

/**
 * 检查所有必需的配置
 */
export function checkAllConfig(): ConfigCheckResult {
  const twitterCheck = checkTwitterApiKey();
  const anthropicCheck = checkAnthropicApiKey();

  const missingKeys = [
    ...twitterCheck.missingKeys,
    ...anthropicCheck.missingKeys,
  ];

  if (missingKeys.length > 0) {
    return {
      isValid: false,
      missingKeys,
      message: `缺少必需的配置: ${missingKeys.join(', ')}。请在 .env.local 文件中配置这些环境变量。`,
    };
  }

  return {
    isValid: true,
    missingKeys: [],
    message: '所有配置已就绪',
  };
}
