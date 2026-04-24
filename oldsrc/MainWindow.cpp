#include "MainWindow.h"
#include "ui_MainWindow.h"

#include <QProcess>
#include <QStringList>
#include <QDebug>
#include <QSharedPointer>
#include <QMessageBox>
#include <QSet>
#include <QFile>
#include <QCompleter>
#include <QScrollBar>

#define HISTROYIPFILR "histroyIp"

MainWindow::MainWindow(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::MainWindow)
{
    ui->setupUi(this);
    initUi();
    ConnectAll();
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::slot_getKV()
{
    QStringList args;
    args << "-e" << QString("%1://%2:%3").arg(ui->comboBox->currentText(),ui->ipcombox->currentText(),ui->portEdit->text())
         << "get" << ui->keyEdit->text();

    execCommand(args);

}

void MainWindow::slot_putKV()
{
    if(ui->valueEdit->text().isEmpty() || ui->keyEdit->text().isEmpty())
    {
        QMessageBox::information(this,"提示","请输入key或者value");
        return;
    }

    QStringList args;
    args << "-e" << QString("%1://%2:%3").arg(ui->comboBox->currentText(),ui->ipcombox->currentText(),ui->portEdit->text())
         << "put" << ui->keyEdit->text() << ui->valueEdit->text();

    execCommand(args);
}

void MainWindow::slot_deleteKV()
{
    if(ui->keyEdit->text().isEmpty())
    {
        QMessageBox::information(this,"提示","请输入key");
        return;
    }

    QStringList args;
    args << "-e" << QString("%1://%2:%3").arg(ui->comboBox->currentText(),ui->ipcombox->currentText(),ui->portEdit->text())
         << "del" << ui->keyEdit->text();

    execCommand(args);
}

void MainWindow::slot_memberList()
{
    QStringList args;
    args << "-e" << QString("%1://%2:%3").arg(ui->comboBox->currentText(),ui->ipcombox->currentText(),ui->portEdit->text())
         << "member"<<"list";

    execCommand(args);
}

//执行用户自定义的命令
void MainWindow::slot_execUsterCmd()
{
    auto temp = ui->cmdEdit->text();
    if(temp.isEmpty())
    {
        QMessageBox::information(this,"提示","请输入要执行的命令");
        return;
    }

    if(temp == "-h")
    {
        execCommand({temp});
        return;
    }

    auto tempList = temp.split(" ",QString::SkipEmptyParts);
    QStringList args;
    args << "-e" << QString("%1://%2:%3").arg(ui->comboBox->currentText(),ui->ipcombox->currentText(),ui->portEdit->text());
    args << tempList;
    execCommand(args);
}

// 窗口关闭事件
void MainWindow::closeEvent(QCloseEvent *e)
{
    //记录输入过的ip
    QSet<QString> _ips;
    for(int i = 0; i < ui->ipcombox->count(); i++)
    {
        _ips.insert(ui->ipcombox->itemText(i));
    }
    QFile f(HISTROYIPFILR);
    if(f.open(QFile::WriteOnly))
    {
        auto _temp = _ips.toList().join("\n");
        f.write(_temp.toUtf8());
    }
    f.close();

    QMainWindow::closeEvent(e);
}

void MainWindow::initUi()
{
    ui->comboBox->setCurrentIndex(1);
    ui->portEdit->setText("7375");
    ui->textEdit->setReadOnly(true);
    readHistroyAddr();
    ui->keybox->hide();

//    auto width = this->width() / 5;
//    ui->splitter->setSizes({1,100});
}

//连接所有信号
void MainWindow::ConnectAll()
{
    connect(ui->getBtn,&QPushButton::clicked,this,&MainWindow::slot_getKV);
    connect(ui->putBtn,&QPushButton::clicked,this,&MainWindow::slot_putKV);
    connect(ui->delbtn,&QPushButton::clicked,this,&MainWindow::slot_deleteKV);
    connect(ui->listbtn,&QPushButton::clicked,this,&MainWindow::slot_memberList);
    connect(ui->cmdbtn,&QPushButton::clicked,this,&MainWindow::slot_execUsterCmd);

    connect(ui->ipcombox->lineEdit(),&QLineEdit::editingFinished,this,[this](){
        auto ip = ui->ipcombox->lineEdit()->text();
        if(m_ips.contains(ip))
        {
            return ;
        }
        //添加到列表中
        m_ips.insert(ip);
        ui->ipcombox->addItem(ip);
        auto model = ui->ipcombox->completer()->model();
        int row = model->rowCount();
        model->insertRow(row);
        model->setData(model->index(row,0),ip);
    });
}

//读取历史ip地址
void MainWindow::readHistroyAddr()
{
    m_ips = {"127.0.0.1"};
    QFile file(HISTROYIPFILR);
    do
    {
        if(!file.exists())
        {
            break;
        }

        bool f = file.open(QFile::ReadOnly);
        if (!f)
        {
            break;
        }

        while (!file.atEnd())
        {
            auto _ip = file.readLine().trimmed();
            m_ips.insert(_ip);
        }
    }while(false);

    file.close();

    QStringList _keywords = m_ips.toList();
    ui->ipcombox->addItems(_keywords);
    QCompleter *pleter = new QCompleter(_keywords,ui->ipcombox);
    pleter->setFilterMode(Qt::MatchContains);
    pleter->setCaseSensitivity(Qt::CaseInsensitive);
    ui->ipcombox->setCompleter(pleter);
}

void MainWindow::execCommand(const QStringList &args)
{
    if(!ui->histroyBox->isChecked())
    {
        ui->textEdit->clear();
    }

    auto tempargs = args;
    if(ui->prebox->isChecked())
    {
        tempargs << "--prefix";
    }
    if(ui->keybox->isChecked())
    {
        tempargs << "--keys";
    }

    QSharedPointer<QProcess> process(new QProcess(this));
    connect(process.get(),&QProcess::readyReadStandardOutput,this,[this,&process](){
        //获取当前的最大值
        auto val = ui->textEdit->verticalScrollBar()->maximum();
        auto str = process->readAllStandardOutput();
        appendTextToEdit(str,"black");
        appendTextToEdit("<<<<<<<<<<<<<<<<<end<<<<<<<<<<<<<<<","green");
        if(val > 0)
        {
            auto hight = ui->textEdit->height() - 50;
            ui->textEdit->verticalScrollBar()->setValue(val + hight);
        }
        else
        {
            ui->textEdit->verticalScrollBar()->setValue(0);
        }
    });

    connect(process.get(),&QProcess::readyReadStandardError,this,[this,&process](){
        auto str = process->readAllStandardError();
        QMessageBox::critical(this,"错误",str);
    });

    //添加执行的命令
    auto cmdstr = QString("cmd: craftctl %2\n").arg(tempargs.join(" "));
    appendTextToEdit(cmdstr,"green");

    process->start("craftctl",tempargs);
    process->waitForFinished();

}

//添加文本到编辑器中
void MainWindow::appendTextToEdit(const QString &txt, const QString &color)
{
    auto temp = txt.toHtmlEscaped();
    temp.replace("\n","<br>");
    auto html = QString(R"(<p style="color: %1">%2</p>)").arg(color).arg(temp);
    ui->textEdit->append(html);
}
