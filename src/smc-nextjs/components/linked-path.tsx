/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";

interface Props {
  id: string;
  path: string;
  relativePath: string;
  isdir?: boolean;
}

export default function LinkedPath({ id, path, relativePath, isdir }: Props) {
  let href = `/public_paths/${id}`;
  const first = (
    <Link href={href}>
      <a>{path}</a>
    </Link>
  );
  const slash = <span>{" "}/{" "}</span>;
  const segments: JSX.Element[] = [first, slash];
  for (const segment of relativePath.split("/")) {
    if (!segment) continue;
    href += `/${encodeURIComponent(segment)}`;
    segments.push(
      <Link href={href}>
        <a>{segment}</a>
      </Link>
    );
    segments.push(slash);
  }
  if (!isdir) {
    segments.pop();
  }
  return <>{segments}</>;
}