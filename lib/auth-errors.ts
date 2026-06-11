/** 将 NextAuth signIn 返回的 error 码映射为中文提示 */
export function mapSignInError(error?: string | null): string {
  if (!error) return '登录失败，请稍后重试。'

  switch (error) {
    case 'CredentialsSignin':
      return '邮箱或密码错误，请重试。'
    case 'Configuration':
      return '登录服务配置异常，请确认已设置 NEXTAUTH_SECRET。'
    case 'CONFIG_MISSING_SECRET':
      return '未配置 NEXTAUTH_SECRET，请在 .env.local 中设置后重启开发服务器。'
    case 'CONFIG_MISSING_DATABASE':
      return '未配置 DATABASE_URL，无法验证账号。'
    case 'DATABASE_UNAVAILABLE':
      return '无法连接数据库，请确认 PostgreSQL 已启动且 DATABASE_URL 正确。'
    default:
      return `登录失败：${error}`
  }
}
