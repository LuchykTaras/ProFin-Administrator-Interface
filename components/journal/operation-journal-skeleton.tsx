import styles from "./operation-journal.module.css";

const COLUMNS = Array.from({ length: 12 }, (_, index) => index);
const ROWS = Array.from({ length: 16 }, (_, index) => index);

export default function OperationJournalSkeleton() {
  return (
    <section
      className={styles.shell}
      aria-busy="true"
      aria-label="Завантаження журналу операцій"
    >
      <span className={styles.skeletonStatus} role="status">
        Завантажуємо журнал операцій із Бази операцій.
      </span>

      <div aria-hidden="true">
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>БАЗА ОПЕРАЦІЙ</div>

            <div className={styles.titleRow}>
              <span
                className={`${styles.skeletonBar} ${styles.skeletonTitle}`}
              />
              <span
                className={`${styles.skeletonBar} ${styles.skeletonBadge}`}
              />
            </div>

            <div className={styles.summary}>
              <span
                className={`${styles.skeletonBar} ${styles.skeletonSummary}`}
              />
            </div>
          </div>

          <div className={styles.monthNavigation}>
            <span
              className={`${styles.skeletonBar} ${styles.skeletonNav}`}
            />
            <span
              className={`${styles.skeletonBar} ${styles.skeletonNav}`}
            />
          </div>
        </div>

        <div className={styles.toolbar}>
          {Array.from({ length: 5 }, (_, index) => (
            <span
              key={index}
              className={`${styles.skeletonBar} ${styles.skeletonControl}`}
            />
          ))}
        </div>

        <div className={styles.resultLine}>
          <span
            className={`${styles.skeletonBar} ${styles.skeletonCount}`}
          />
        </div>

        <div className={styles.skeletonViewport}>
          <table className={styles.skeletonTable}>
            <thead>
              <tr>
                {COLUMNS.map(column => (
                  <th key={column}>
                    <span
                      className={`${styles.skeletonBar} ${styles.skeletonCell}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {ROWS.map(row => (
                <tr key={row}>
                  {COLUMNS.map(column => (
                    <td key={column}>
                      <span
                        className={`${styles.skeletonBar} ${styles.skeletonCell}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <span
            className={`${styles.skeletonBar} ${styles.skeletonFooterShort}`}
          />
          <span
            className={`${styles.skeletonBar} ${styles.skeletonFooterMedium}`}
          />
          <span
            className={`${styles.skeletonBar} ${styles.skeletonFooterLong}`}
          />
        </div>
      </div>
    </section>
  );
}