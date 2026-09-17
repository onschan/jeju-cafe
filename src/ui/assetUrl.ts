/** 배포 서브패스(base)를 반영한 정적 자산 URL. 루트-상대 '/x' 대신 항상 이걸 통해 참조한다. */
export const assetUrl = (p: string): string => `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;
