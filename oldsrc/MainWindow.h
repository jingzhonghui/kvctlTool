#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QCloseEvent>
#include <QSet>
#include <QColor>

namespace Ui {
class MainWindow;
}

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

protected:
    void slot_getKV();

    void slot_putKV();

    void slot_deleteKV();

    //执行memberlist
    void slot_memberList();

    //执行用户自定义的命令
    void slot_execUsterCmd();
protected:
    // 窗口关闭事件
    void closeEvent(QCloseEvent * e) override;

private:
    /**
     * @brief initUi
     */
    void initUi();

    void ConnectAll();

    /**
     * @brief readHistroyAddr
     * 读取历史ＩＰ地址
     */
    void readHistroyAddr();

    /**
     * @brief execCommand
     * 执行命令
     * @param args
     */
    void execCommand(const QStringList &args);

    // 添加文件到编辑器中，可指定颜色
    void appendTextToEdit(const QString& txt, const QString& color);

private:
    Ui::MainWindow *ui;

    QSet<QString> m_ips;
};

#endif // MAINWINDOW_H
